import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { getCatalog } from "@/lib/clinic";
import { isValidChatId, saveConversationSummary } from "@/lib/conversations";
import { buildInstructions } from "@/lib/receptionist";
import { createReceptionistTools } from "@/lib/tools";
import { findPreparedBooking, phonesTypedByPatient } from "@/lib/booking-guard";
import {
  MAX_BODY_BYTES,
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  checkChatLimit,
  clientIp,
  detectTrickAttempt,
  guardBlocks,
  recordSecurityEvent,
} from "@/lib/security";

// Allow up to 30 seconds for the agent to think and use its tools
export const maxDuration = 30;

// The model can be changed in .env.local without touching the code
const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";

/** Text the patient typed in a message. */
function textOf(message: UIMessage | undefined): string {
  return (message?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("\n");
}

/** Plain-text error the chat widget can show. */
function refuse(status: number, message: string) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Runs security logging after the reply, so it never slows Noor down or breaks the chat. */
function logLater(task: () => Promise<unknown>) {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error("Security logging failed:", error);
    }
  });
}

export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  // 1. Refuse oversized requests before reading them (someone sending huge payloads)
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_BODY_BYTES) {
    logLater(() => recordSecurityEvent({ kind: "oversized_request", ip, details: `A chat request of ${Math.round(size / 1024)} KB was refused.` }));
    return refuse(413, "That message is too long.");
  }

  let body: { id?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return refuse(400, "Bad request.");
  }
  const chatId = isValidChatId(body.id) ? body.id : null;
  if (!Array.isArray(body.messages) || body.messages.length === 0) return refuse(400, "Bad request.");
  const messages = body.messages as UIMessage[];
  const latest = messages[messages.length - 1];
  const latestText = latest?.role === "user" ? textOf(latest) : "";

  // 2. Refuse very long messages or very long chats (they would burn through the AI quota)
  if (latestText.length > MAX_MESSAGE_CHARS || messages.length > MAX_HISTORY_MESSAGES) {
    logLater(() =>
      recordSecurityEvent({
        kind: "oversized_request",
        ip,
        chatId,
        details:
          latestText.length > MAX_MESSAGE_CHARS
            ? `A ${latestText.length}-character message was refused (limit ${MAX_MESSAGE_CHARS}).`
            : `A chat with ${messages.length} messages was refused (limit ${MAX_HISTORY_MESSAGES}).`,
      }),
    );
    return refuse(413, latestText.length > MAX_MESSAGE_CHARS ? "That message is too long." : "This chat is too long. Please start a new chat.");
  }

  // 3. Flood limit per device. If the security check itself fails, let the chat through.
  try {
    const brokenLimit = await checkChatLimit(ip, chatId);
    if (brokenLimit) {
      return refuse(429, "You've sent a lot of messages. Please wait a few minutes, or call the clinic on 011 555 0123.");
    }
  } catch (error) {
    console.error("Chat limit check failed:", error);
  }

  // 4. Note attempts to trick Noor. She still answers normally; her code checks stop anything unsafe.
  const trick = detectTrickAttempt(latestText);
  if (trick) {
    logLater(() =>
      recordSecurityEvent({ kind: "prompt_injection", ip, chatId, details: `A visitor ${trick}: "${latestText.slice(0, 160)}"` }),
    );
  }

  const catalog = await getCatalog();
  const prepared = findPreparedBooking(messages);
  const tools = createReceptionistTools(prepared, phonesTypedByPatient(messages));

  const result = streamText({
    model: google(MODEL),
    instructions: buildInstructions(catalog),
    messages: await convertToModelMessages(messages),
    tools,
    // book_appointment is hidden unless the patient is answering a read-back
    activeTools: prepared
      ? ["get_clinic_info", "check_availability", "prepare_booking", "book_appointment", "find_appointments", "cancel_appointment"]
      : ["get_clinic_info", "check_availability", "prepare_booking", "find_appointments", "cancel_appointment"],
    // Let the agent use several tools in a row (e.g. check availability, then answer)
    stopWhen: isStepCount(6),
  });

  // After the reply: log anything Noor's safety checks blocked
  logLater(async () => {
    // If the AI call itself failed there are no tool results to check
    const toolResults = await Promise.resolve(result.toolResults).catch(() => []);
    for (const details of guardBlocks(toolResults.map((r) => r.output))) {
      await recordSecurityEvent({ kind: "guard_blocked", ip, chatId, details });
    }
  });

  // After the reply has been sent, write a short summary of the chat for the staff dashboard
  if (chatId) {
    after(async () => {
      try {
        const [latestReply, toolResults] = await Promise.all([result.text, result.toolResults]);
        await saveConversationSummary({
          chatId,
          messages,
          latestReply,
          latestEvents: toolResults.map((r) => ({ toolName: r.toolName, output: r.output })),
          model: MODEL,
        });
      } catch (error) {
        console.error("Conversation summary failed:", error);
      }
    });
  }

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}

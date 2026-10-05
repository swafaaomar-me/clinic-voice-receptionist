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

// Allow up to 30 seconds for the agent to think and use its tools
export const maxDuration = 30;

// The model can be changed in .env.local without touching the code
const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";

export async function POST(req: Request) {
  const { id: chatId, messages }: { id?: unknown; messages: UIMessage[] } = await req.json();

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

  // After the reply has been sent, write a short summary of the chat for the staff dashboard
  if (isValidChatId(chatId)) {
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

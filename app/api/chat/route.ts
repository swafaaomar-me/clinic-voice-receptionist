import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { getCatalog } from "@/lib/clinic";
import { buildInstructions } from "@/lib/receptionist";
import { createReceptionistTools } from "@/lib/tools";
import { findPreparedBooking } from "@/lib/booking-guard";

// Allow up to 30 seconds for the agent to think and use its tools
export const maxDuration = 30;

// The model can be changed in .env.local without touching the code
const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const catalog = await getCatalog();
  const prepared = findPreparedBooking(messages);
  const tools = createReceptionistTools(prepared);

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

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}

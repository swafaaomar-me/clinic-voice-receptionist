import { google } from "@ai-sdk/google";
import { generateText, Output, type LanguageModel, type UIMessage } from "ai";
import { z } from "zod";
import { db } from "./supabase";

/** What happened in a conversation, worked out from Noor's tool results (not from the AI). */
interface ConversationFacts {
  outcome: "booked" | "cancelled" | null;
  appointmentId: number | null;
  patientName: string | null;
  patientPhone: string | null;
}

/** A tool call and its result, from either the earlier messages or the reply just sent. */
export interface ToolEvent {
  toolName: string;
  output: unknown;
}

const OUTCOMES = ["question", "emergency", "no_action"] as const;

const summarySchema = z.object({
  summary: z
    .string()
    .describe("One or two short sentences in English for clinic staff: what the patient wanted and what happened."),
  outcome: z
    .enum(OUTCOMES)
    .describe("question: asked about the clinic; emergency: urgent pain, swelling, bleeding or injury; no_action: nothing useful happened"),
  language: z.enum(["en", "ar", "mixed"]).describe("Language the patient used"),
});

/** Chat IDs come from the browser, so only accept simple, short ones. */
export function isValidChatId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{6,100}$/.test(id);
}

/** Collects tool results from the conversation's earlier messages. */
export function toolEventsFromMessages(messages: UIMessage[]): ToolEvent[] {
  return messages.flatMap((m) =>
    m.parts.flatMap((p) => {
      if (!p.type.startsWith("tool-")) return [];
      const part = p as { type: string; state?: string; output?: unknown };
      return part.state === "output-available" ? [{ toolName: part.type.slice(5), output: part.output }] : [];
    }),
  );
}

/** Works out bookings, cancellations, name and phone from what the tools actually returned. */
export function factsFromToolEvents(events: ToolEvent[]): ConversationFacts {
  const facts: ConversationFacts = { outcome: null, appointmentId: null, patientName: null, patientPhone: null };
  for (const { toolName, output } of events) {
    const o = output as Record<string, unknown> | null;
    if (!o || o.ok !== true) continue;
    if (typeof o.patient_name === "string") facts.patientName = o.patient_name;
    if (typeof o.patient_phone === "string") facts.patientPhone = o.patient_phone;
    if (toolName === "book_appointment" && typeof o.appointment_id === "number") {
      facts.outcome = "booked";
      facts.appointmentId = o.appointment_id;
    }
    if (toolName === "cancel_appointment" && facts.outcome !== "booked") {
      facts.outcome = "cancelled";
      if (typeof o.cancelled_appointment_id === "number") facts.appointmentId = o.cancelled_appointment_id;
    }
  }
  return facts;
}

/** A plain-text transcript for the summariser, with tool actions noted in brackets. */
export function transcriptOf(messages: UIMessage[], latestReply: string, latestEvents: ToolEvent[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text" && p.text.trim()) lines.push(`${m.role === "user" ? "Patient" : "Noor"}: ${p.text.trim()}`);
    }
  }
  for (const e of latestEvents) {
    const ok = (e.output as { ok?: boolean } | null)?.ok;
    lines.push(`[Noor used ${e.toolName}: ${ok === false ? "refused" : "done"}]`);
  }
  if (latestReply.trim()) lines.push(`Noor: ${latestReply.trim()}`);
  // Keep the newest part of long chats so the request stays small
  return lines.join("\n").slice(-6000);
}

/**
 * Writes (or updates) the summary for one chat. Runs after the reply has been sent,
 * so a slow or failed summary never affects the patient.
 */
export async function saveConversationSummary(options: {
  chatId: string;
  messages: UIMessage[];
  latestReply: string;
  latestEvents: ToolEvent[];
  model: string;
  /** Lets tests swap in a stand-in model instead of calling Gemini. */
  languageModel?: LanguageModel;
}) {
  const { chatId, messages, latestReply, latestEvents, model, languageModel } = options;
  const userMessages = messages.filter((m) => m.role === "user").length;
  if (userMessages === 0) return;

  const facts = factsFromToolEvents([...toolEventsFromMessages(messages), ...latestEvents]);

  const { output } = await generateText({
    model: languageModel ?? google(process.env.SUMMARY_MODEL ?? model),
    output: Output.object({ schema: summarySchema }),
    instructions:
      "You write very short notes for dental clinic staff about chats between patients and Noor, the clinic's AI receptionist. " +
      "Write in English even if the chat was in Arabic. Mention the treatment, dentist, day and time when relevant. " +
      "Don't include phone numbers. Don't add anything that isn't in the chat.",
    prompt: transcriptOf(messages, latestReply, latestEvents),
  });

  const { error } = await db()
    .from("conversations")
    .upsert(
      {
        chat_id: chatId,
        updated_at: new Date().toISOString(),
        summary: output.summary.slice(0, 600),
        outcome: facts.outcome ?? output.outcome,
        language: output.language,
        patient_name: facts.patientName,
        patient_phone: facts.patientPhone,
        appointment_id: facts.appointmentId,
        message_count: messages.length + 1,
      },
      { onConflict: "chat_id" },
    );
  if (error) throw new Error(`Could not save conversation summary: ${error.message}`);
}

export interface ConversationRow {
  id: number;
  startedAt: string;
  updatedAt: string;
  language: string | null;
  outcome: string;
  summary: string;
  patientName: string | null;
  patientPhone: string | null;
  messageCount: number;
}

/** The most recent conversations, newest first, optionally filtered by outcome. */
export async function listConversations(options: { outcome?: string; limit?: number } = {}) {
  let query = db()
    .from("conversations")
    .select("id, started_at, updated_at, language, outcome, summary, patient_name, patient_phone, message_count")
    .order("updated_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.outcome) query = query.eq("outcome", options.outcome);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load conversations: ${error.message}`);
  return (data ?? []).map(
    (c): ConversationRow => ({
      id: c.id,
      startedAt: c.started_at,
      updatedAt: c.updated_at,
      language: c.language,
      outcome: c.outcome,
      summary: c.summary,
      patientName: c.patient_name,
      patientPhone: c.patient_phone,
      messageCount: c.message_count,
    }),
  );
}

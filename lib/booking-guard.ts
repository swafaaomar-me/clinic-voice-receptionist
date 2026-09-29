import type { UIMessage } from "ai";
import type { PreparedBooking } from "./tools";

/**
 * Finds the booking Noor read back in her previous reply (a successful prepare_booking).
 * Booking is only unlocked when the patient is replying to that read-back.
 */
export function findPreparedBooking(messages: UIMessage[]): PreparedBooking | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return null;
  const previousReply = messages.slice(0, -1).findLast((m) => m.role === "assistant");
  if (!previousReply) return null;

  for (const part of [...previousReply.parts].reverse()) {
    if (part.type !== "tool-prepare_booking" || part.state !== "output-available") continue;
    const output = part.output as { ok?: boolean; patient_phone?: string } | undefined;
    const input = part.input as Omit<PreparedBooking, "patient_phone"> | undefined;
    if (output?.ok && output.patient_phone && input) {
      return {
        service_id: input.service_id,
        dentist_id: input.dentist_id,
        date: input.date,
        time: input.time,
        patient_phone: output.patient_phone,
      };
    }
  }
  return null;
}


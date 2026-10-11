import { describe, expect, it } from "vitest";
import { factsFromToolEvents, isValidChatId } from "@/lib/conversations";

describe("conversation summaries", () => {
  it("accepts real chat IDs and rejects junk", () => {
    expect(isValidChatId(crypto.randomUUID())).toBe(true);
    expect(isValidChatId("x")).toBe(false);
    expect(isValidChatId("<script>")).toBe(false);
    expect(isValidChatId(42)).toBe(false);
  });

  it("marks a chat as booked only when the booking really succeeded", () => {
    const booked = factsFromToolEvents([
      { toolName: "book_appointment", output: { ok: true, appointment_id: 7, patient_name: "Rana", patient_phone: "0538078783" } },
    ]);
    expect(booked).toEqual({ outcome: "booked", appointmentId: 7, patientName: "Rana", patientPhone: "0538078783" });

    const refused = factsFromToolEvents([{ toolName: "book_appointment", output: { ok: false, error: "taken" } }]);
    expect(refused.outcome).toBeNull();
  });

  it("records who cancelled", () => {
    const facts = factsFromToolEvents([
      { toolName: "cancel_appointment", output: { ok: true, cancelled_appointment_id: 9, patient_name: "Yousef", patient_phone: "0560606888" } },
    ]);
    expect(facts).toMatchObject({ outcome: "cancelled", appointmentId: 9, patientName: "Yousef" });
  });
});

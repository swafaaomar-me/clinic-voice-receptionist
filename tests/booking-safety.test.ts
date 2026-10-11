import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { findPreparedBooking, phonesTypedByPatient } from "@/lib/booking-guard";
import { createReceptionistTools, type PreparedBooking } from "@/lib/tools";

// These checks stop the AI from booking without the patient's "yes", or with a phone number they never gave.
// They all refuse before touching the database, so no database is needed here.

const user = (text: string): UIMessage => ({ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] });

const readBack = (output: object): UIMessage =>
  ({
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [
      {
        type: "tool-prepare_booking",
        toolCallId: "call-1",
        state: "output-available",
        input: { service_id: 2, dentist_id: 1, date: "2026-10-12", time: "13:00", patient_name: "Rana", patient_phone: "0538078783" },
        output,
      },
      { type: "text", text: "Shall I book this for you?" },
    ],
  }) as UIMessage;

const booking = { service_id: 2, dentist_id: 1, date: "2026-10-12", time: "13:00", patient_name: "Rana", patient_phone: "0538078783" };
const run = (tool: unknown, input: object) =>
  (tool as { execute: (input: object, options: object) => Promise<{ ok: boolean; guard?: string }> }).execute(input, {
    toolCallId: "test",
    messages: [],
  });

describe("booking is only unlocked by the patient's reply to a read-back", () => {
  it("finds the read-back when the patient is answering it", () => {
    const messages = [user("my number is 0538078783"), readBack({ ok: true, patient_phone: "0538078783" }), user("yes")];
    expect(findPreparedBooking(messages)).toMatchObject({ dentist_id: 1, time: "13:00", patient_phone: "0538078783" });
  });

  it("stays locked if the read-back failed", () => {
    const messages = [readBack({ ok: false, error: "That time is taken" }), user("yes")];
    expect(findPreparedBooking(messages)).toBeNull();
  });

  it("stays locked if the patient hasn't replied yet", () => {
    expect(findPreparedBooking([user("hi"), readBack({ ok: true, patient_phone: "0538078783" })])).toBeNull();
  });
});

describe("phone numbers must come from the patient", () => {
  it("only collects numbers from the patient's own messages", () => {
    const fromNoor = { id: "a", role: "assistant", parts: [{ type: "text", text: "Is it 0500000000?" }] } as UIMessage;
    expect(phonesTypedByPatient([user("call me on 0538078783"), fromNoor])).toEqual(["0538078783"]);
  });

  it("refuses a number nobody typed (an invented number)", async () => {
    const tools = createReceptionistTools(null, []);
    expect(await run(tools.prepare_booking, { ...booking, patient_phone: "0500000000" })).toMatchObject({ ok: false, guard: "unknown_phone" });
  });

  it("points Noor back to the real number when she copies it wrong", async () => {
    const tools = createReceptionistTools(null, ["0538078783"]);
    const result = await run(tools.find_appointments, { patient_phone: "0538078788" });
    expect(result).toMatchObject({ ok: false, guard: "phone_slip" });
  });
});

describe("book_appointment", () => {
  const prepared: PreparedBooking = { service_id: 2, dentist_id: 1, date: "2026-10-12", time: "13:00", patient_phone: "0538078783" };

  it("refuses without a confirmed read-back", async () => {
    const tools = createReceptionistTools(null, ["0538078783"]);
    expect(await run(tools.book_appointment, booking)).toMatchObject({ ok: false, guard: "not_confirmed" });
  });

  it("refuses if the details changed after the patient said yes", async () => {
    const tools = createReceptionistTools(prepared, ["0538078783"]);
    expect(await run(tools.book_appointment, { ...booking, time: "14:00" })).toMatchObject({ ok: false, guard: "details_changed" });
  });
});

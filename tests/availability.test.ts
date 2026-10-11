import { describe, expect, it } from "vitest";
import { freeSlots } from "@/lib/availability";
import { riyadhInstant } from "@/lib/time";

const DAY = "2026-10-12"; // a Monday
const longAgo = new Date("2026-01-01T00:00:00Z");

describe("freeSlots", () => {
  it("offers every half hour where the whole treatment fits before closing", () => {
    const slots = freeSlots({ date: DAY, durationMinutes: 45, hours: { start: "09:00", end: "11:00" }, busy: [], notBefore: longAgo });
    expect(slots).toEqual(["09:00", "09:30", "10:00"]); // 10:30 + 45 min would end after 11:00
  });

  it("skips times that overlap an existing booking", () => {
    const busy = [{ start: riyadhInstant(DAY, "09:30"), end: riyadhInstant(DAY, "10:00") }];
    const slots = freeSlots({ date: DAY, durationMinutes: 30, hours: { start: "09:00", end: "11:00" }, busy, notBefore: longAgo });
    expect(slots).toEqual(["09:00", "10:00", "10:30"]);
  });

  it("never offers times in the past", () => {
    const slots = freeSlots({
      date: DAY,
      durationMinutes: 30,
      hours: { start: "09:00", end: "11:00" },
      busy: [],
      notBefore: riyadhInstant(DAY, "10:15"),
    });
    expect(slots).toEqual(["10:30"]);
  });

  it("returns nothing on a day the dentist doesn't work", () => {
    expect(freeSlots({ date: DAY, durationMinutes: 30, hours: null, busy: [], notBefore: longAgo })).toEqual([]);
  });
});

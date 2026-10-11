import { describe, expect, it } from "vitest";
import { addDays, isValidDate, isValidTime, riyadhInstant, riyadhToday, toRiyadh, weekdayName } from "@/lib/time";

describe("Riyadh time (UTC+3, no daylight saving)", () => {
  it("converts Riyadh clock time to the right instant", () => {
    expect(riyadhInstant("2026-10-12", "09:00").toISOString()).toBe("2026-10-12T06:00:00.000Z");
  });

  it("uses Riyadh's date, not UTC's, late at night", () => {
    expect(riyadhToday(new Date("2026-10-11T22:30:00Z"))).toBe("2026-10-12"); // 1:30 AM in Riyadh
    expect(toRiyadh(new Date("2026-10-11T22:30:00Z"))).toEqual({ date: "2026-10-12", time: "01:30" });
  });

  it("works out weekdays and adds days across month ends", () => {
    expect(weekdayName("2026-10-16")).toBe("Friday");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("validates dates and times", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-10-12")).toBe(true);
    expect(isValidTime("25:00")).toBe(false);
    expect(isValidTime("09:30")).toBe(true);
  });
});

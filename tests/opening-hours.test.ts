import { describe, expect, it } from "vitest";
import type { Catalog } from "@/lib/clinic";
import { clinicHoursOn, clinicStatus, to12Hour } from "@/lib/opening-hours";

// Two dentists: one Sunday–Thursday 9–5, one Saturday 10–2. Nobody on Friday.
const catalog: Catalog = {
  services: [],
  dentists: [
    {
      id: 1, name: "Dr. A", name_ar: "د. أ", specialty: "", specialty_ar: "", serviceIds: [],
      workingDays: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: "09:00", end: "17:00" })),
    },
    {
      id: 2, name: "Dr. B", name_ar: "د. ب", specialty: "", specialty_ar: "", serviceIds: [],
      workingDays: [{ weekday: 6, start: "10:00", end: "14:00" }],
    },
  ],
};
const riyadh = (iso: string) => new Date(`${iso}+03:00`);

describe("opening hours", () => {
  it("formats 12-hour times", () => {
    expect(to12Hour("00:30")).toBe("12:30 AM");
    expect(to12Hour("13:00")).toBe("1:00 PM");
  });

  it("is closed on Friday", () => {
    expect(clinicHoursOn(catalog, 5)).toBeNull();
  });

  it("says open, with closing time, during hours", () => {
    expect(clinicStatus(catalog, riyadh("2026-10-12T11:00"))).toEqual({ isOpen: true, label: "Open now until 5:00 PM" });
  });

  it("on a Friday, points to Saturday's opening time", () => {
    expect(clinicStatus(catalog, riyadh("2026-10-16T12:00"))).toEqual({ isOpen: false, label: "Closed, opens tomorrow at 10:00 AM" });
  });

  it("before opening, says it opens later today", () => {
    expect(clinicStatus(catalog, riyadh("2026-10-12T07:30")).label).toBe("Closed, opens today at 9:00 AM");
  });
});

import type { Catalog } from "./clinic";
import { addDays, riyadhToday, toRiyadh, weekdayName, weekdayOf } from "./time";

/** The clinic's hours on a weekday: from the earliest dentist start to the latest dentist finish. */
export function clinicHoursOn(catalog: Catalog, weekday: number): { open: string; close: string } | null {
  const shifts = catalog.dentists.flatMap((d) => d.workingDays.filter((w) => w.weekday === weekday));
  if (shifts.length === 0) return null;
  return {
    open: shifts.map((s) => s.start).sort()[0],
    close: shifts.map((s) => s.end).sort().reverse()[0],
  };
}

/** "16:30" -> "4:30 PM" */
export function to12Hour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export interface ClinicStatus {
  isOpen: boolean;
  /** Short, patient-facing text, e.g. "Open now until 6:00 PM" or "Closed, opens Saturday at 10:00 AM" */
  label: string;
}

/** Whether the clinic is open right now, and when it closes or next opens. */
export function clinicStatus(catalog: Catalog, now: Date = new Date()): ClinicStatus {
  const today = riyadhToday(now);
  const { time } = toRiyadh(now);
  const hours = clinicHoursOn(catalog, weekdayOf(today));

  if (hours && time >= hours.open && time < hours.close) {
    return { isOpen: true, label: `Open now until ${to12Hour(hours.close)}` };
  }
  if (hours && time < hours.open) {
    return { isOpen: false, label: `Closed, opens today at ${to12Hour(hours.open)}` };
  }
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, i);
    const next = clinicHoursOn(catalog, weekdayOf(date));
    if (next) {
      const when = i === 1 ? "tomorrow" : weekdayName(date);
      return { isOpen: false, label: `Closed, opens ${when} at ${to12Hour(next.open)}` };
    }
  }
  return { isOpen: false, label: "Closed" };
}

/** A sentence for Noor's instructions saying whether the clinic is open right now. */
export function openingStatus(catalog: Catalog, now: Date = new Date()): string {
  const status = clinicStatus(catalog, now);
  return status.isOpen
    ? `The clinic is OPEN right now (${status.label.toLowerCase()}).`
    : `The clinic is CLOSED right now (${status.label.toLowerCase()}).`;
}

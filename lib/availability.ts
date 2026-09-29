import { riyadhInstant } from "./time";

export interface WorkingHours {
  start: string; // "HH:MM" or "HH:MM:SS"
  end: string;
}

export interface BusyPeriod {
  start: Date;
  end: Date;
}

/** Appointments can start every 30 minutes. */
export const SLOT_STEP_MINUTES = 30;

/**
 * Works out the free start times ("HH:MM") for one dentist on one day.
 * A slot is free when the whole treatment fits inside working hours,
 * doesn't overlap an existing booking, and isn't in the past.
 */
export function freeSlots(options: {
  date: string;
  durationMinutes: number;
  hours: WorkingHours | null;
  busy: BusyPeriod[];
  notBefore: Date;
  stepMinutes?: number;
}): string[] {
  const { date, durationMinutes, hours, busy, notBefore } = options;
  const step = options.stepMinutes ?? SLOT_STEP_MINUTES;
  if (!hours) return []; // dentist doesn't work that day

  const dayStart = riyadhInstant(date, hours.start.slice(0, 5)).getTime();
  const dayEnd = riyadhInstant(date, hours.end.slice(0, 5)).getTime();
  const duration = durationMinutes * 60_000;
  const slots: string[] = [];

  for (let start = dayStart; start + duration <= dayEnd; start += step * 60_000) {
    const end = start + duration;
    if (start < notBefore.getTime()) continue;
    const clashes = busy.some((b) => start < b.end.getTime() && b.start.getTime() < end);
    if (clashes) continue;
    const minutesFromMidnight = (start - riyadhInstant(date, "00:00").getTime()) / 60_000;
    const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, "0");
    const mm = String(minutesFromMidnight % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

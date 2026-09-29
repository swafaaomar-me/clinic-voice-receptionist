// Time helpers. The clinic is in Riyadh, which is always UTC+3 (no daylight saving).

export const CLINIC_TIME_ZONE = "Asia/Riyadh";
const OFFSET = "+03:00";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Turns a Riyadh date ("2026-10-04") and time ("14:30") into an exact moment. */
export function riyadhInstant(date: string, time: string): Date {
  const hhmm = time.length === 5 ? `${time}:00` : time; // accept "14:30" or "14:30:00"
  return new Date(`${date}T${hhmm}${OFFSET}`);
}

/** Today's date in Riyadh, as "YYYY-MM-DD". */
export function riyadhToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE }).format(now);
}

/** The Riyadh date ("YYYY-MM-DD") and time ("HH:MM") of a moment. */
export function toRiyadh(instant: Date): { date: string; time: string } {
  const date = riyadhToday(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return { date, time };
}

/** 0 = Sunday ... 6 = Saturday, matching the working_hours table. */
export function weekdayOf(date: string): number {
  return riyadhInstant(date, "12:00").getUTCDay();
}

export function weekdayName(date: string): string {
  return WEEKDAYS[weekdayOf(date)];
}

/** Adds whole days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const d = riyadhInstant(date, "12:00");
  d.setUTCDate(d.getUTCDate() + days);
  return riyadhToday(d);
}

/** Checks for a real calendar date in "YYYY-MM-DD" form. */
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = riyadhInstant(date, "12:00");
  return !Number.isNaN(d.getTime()) && riyadhToday(d) === date;
}

/** Checks for a time in "HH:MM" (24-hour) form. */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

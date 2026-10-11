import { getCatalog } from "./clinic";
import { clinicHoursOn } from "./opening-hours";
import { db } from "./supabase";
import { addDays, riyadhInstant, riyadhToday, toRiyadh, weekdayName, weekdayOf } from "./time";

export interface StaffAppointment {
  id: number;
  date: string; // Riyadh date, YYYY-MM-DD
  start: string; // Riyadh time, HH:MM
  end: string;
  isPast: boolean;
  patientName: string;
  patientPhone: string;
  notes: string | null;
  dentistId: number;
  dentist: string;
  service: string;
  priceSar: number;
}

/** Booked appointments from the start of today (Riyadh time) for the next `days` days. */
export async function listUpcomingAppointments(options: { days?: number; dentistId?: number } = {}) {
  const today = riyadhToday();
  const from = riyadhInstant(today, "00:00");
  const to = riyadhInstant(addDays(today, options.days ?? 14), "00:00");

  let query = db()
    .from("appointments")
    .select("id, starts_at, ends_at, patient_name, patient_phone, notes, dentist_id, dentists(name), services(name, price_sar)")
    .eq("status", "booked")
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at");
  if (options.dentistId) query = query.eq("dentist_id", options.dentistId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load appointments: ${error.message}`);

  const now = Date.now();
  return (data ?? []).map((a): StaffAppointment => {
    const start = toRiyadh(new Date(a.starts_at));
    const end = toRiyadh(new Date(a.ends_at));
    const dentist = a.dentists as unknown as { name: string } | null;
    const service = a.services as unknown as { name: string; price_sar: number } | null;
    return {
      id: a.id,
      date: start.date,
      start: start.time,
      end: end.time,
      isPast: new Date(a.ends_at).getTime() < now,
      patientName: a.patient_name,
      patientPhone: a.patient_phone,
      notes: a.notes,
      dentistId: a.dentist_id,
      dentist: dentist?.name ?? "Unknown dentist",
      service: service?.name ?? "Unknown treatment",
      priceSar: Number(service?.price_sar ?? 0),
    };
  });
}

/** Cancels a booked appointment on behalf of the clinic. */
export async function cancelAsStaff(id: number) {
  const { error } = await db().from("appointments").update({ status: "cancelled" }).eq("id", id).eq("status", "booked");
  if (error) throw new Error(`Could not cancel: ${error.message}`);
}

export interface ReminderAppointment {
  id: number;
  date: string;
  time: string;
  patientName: string;
  patientPhone: string;
  dentist: string;
  dentistAr: string;
  service: string;
  serviceAr: string;
  reminderSentAt: string | null;
}

/**
 * The next day the clinic is open after today, and its booked appointments.
 * Reminders go out the day before; on Thursday that means Saturday, because Friday is closed.
 */
export async function listReminders(
  today: string = riyadhToday(),
): Promise<{ date: string; closedDaysSkipped: string[]; appointments: ReminderAppointment[] }> {
  const catalog = await getCatalog();
  let date = addDays(today, 1);
  const closedDaysSkipped: string[] = [];
  for (let i = 0; i < 7 && !clinicHoursOn(catalog, weekdayOf(date)); i++) {
    closedDaysSkipped.push(weekdayName(date));
    date = addDays(date, 1);
  }

  const { data, error } = await db()
    .from("appointments")
    .select("id, starts_at, patient_name, patient_phone, reminder_sent_at, dentists(name, name_ar), services(name, name_ar)")
    .eq("status", "booked")
    .gte("starts_at", riyadhInstant(date, "00:00").toISOString())
    .lt("starts_at", riyadhInstant(addDays(date, 1), "00:00").toISOString())
    .order("starts_at");
  if (error) throw new Error(`Could not load reminders: ${error.message}`);

  return {
    date,
    closedDaysSkipped,
    appointments: (data ?? []).map((a) => {
      const dentist = a.dentists as unknown as { name: string; name_ar: string } | null;
      const service = a.services as unknown as { name: string; name_ar: string } | null;
      return {
        id: a.id,
        date,
        time: toRiyadh(new Date(a.starts_at)).time,
        patientName: a.patient_name,
        patientPhone: a.patient_phone,
        dentist: dentist?.name ?? "your dentist",
        dentistAr: dentist?.name_ar ?? "الطبيب",
        service: service?.name ?? "dental",
        serviceAr: service?.name_ar ?? "موعد الأسنان",
        reminderSentAt: a.reminder_sent_at,
      };
    }),
  };
}

/** Notes that staff sent a reminder for this appointment. */
export async function markReminderSent(id: number) {
  const { error } = await db()
    .from("appointments")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "booked");
  if (error) throw new Error(`Could not save reminder: ${error.message}`);
}

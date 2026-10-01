import { db } from "./supabase";
import { addDays, riyadhInstant, riyadhToday, toRiyadh } from "./time";

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

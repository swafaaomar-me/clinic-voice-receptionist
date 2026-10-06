import { db } from "./supabase";
import { freeSlots } from "./availability";
import { normalizeSaudiMobile } from "./phone";
import {
  addDays,
  isValidDate,
  isValidTime,
  riyadhInstant,
  riyadhToday,
  toRiyadh,
  weekdayName,
  weekdayOf,
} from "./time";

/** How far ahead patients can book. */
export const BOOKING_WINDOW_DAYS = 60;
/** Bookings need at least this much notice. */
const MIN_NOTICE_MINUTES = 60;

export interface Dentist {
  id: number;
  name: string;
  name_ar: string;
  specialty: string;
  specialty_ar: string;
}

export interface Service {
  id: number;
  name: string;
  name_ar: string;
  description: string;
  duration_minutes: number;
  price_sar: number;
}

export interface Catalog {
  dentists: (Dentist & { serviceIds: number[]; workingDays: { weekday: number; start: string; end: string }[] })[];
  services: Service[];
}

function fail(message: string): never {
  throw new Error(message);
}

/** Dentists, services, who does what, and weekly schedules. Small enough to give the AI in full. */
export async function getCatalog(): Promise<Catalog> {
  const [dentists, services, links, hours] = await Promise.all([
    db().from("dentists").select("id, name, name_ar, specialty, specialty_ar").eq("active", true).order("id"),
    db().from("services").select("id, name, name_ar, description, duration_minutes, price_sar").order("id"),
    db().from("dentist_services").select("dentist_id, service_id"),
    db().from("working_hours").select("dentist_id, weekday, start_time, end_time").order("weekday"),
  ]);
  for (const r of [dentists, services, links, hours]) {
    if (r.error) fail(`Could not load clinic data: ${r.error.message}`);
  }
  return {
    services: (services.data ?? []).map((s) => ({ ...s, price_sar: Number(s.price_sar) })),
    dentists: (dentists.data ?? []).map((d) => ({
      ...d,
      serviceIds: (links.data ?? []).filter((l) => l.dentist_id === d.id).map((l) => l.service_id),
      workingDays: (hours.data ?? [])
        .filter((h) => h.dentist_id === d.id)
        .map((h) => ({ weekday: h.weekday, start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) })),
    })),
  };
}

export async function getClinicInfo() {
  const { data, error } = await db().from("clinic_info").select("topic, content, content_ar");
  if (error) fail(`Could not load clinic info: ${error.message}`);
  return data ?? [];
}

/** Checks a requested date is valid, not in the past and inside the booking window. */
function checkBookableDate(date: string): string | null {
  if (!isValidDate(date)) return "Invalid date. Use the format YYYY-MM-DD.";
  const today = riyadhToday();
  if (date < today) return "That date is in the past.";
  if (date > addDays(today, BOOKING_WINDOW_DAYS)) {
    return `Bookings can only be made up to ${BOOKING_WINDOW_DAYS} days ahead.`;
  }
  return null;
}

async function bookedPeriods(dentistIds: number[], fromDate: string, toDate: string) {
  const { data, error } = await db()
    .from("appointments")
    .select("dentist_id, starts_at, ends_at")
    .in("dentist_id", dentistIds)
    .eq("status", "booked")
    .lt("starts_at", riyadhInstant(addDays(toDate, 1), "00:00").toISOString())
    .gt("ends_at", riyadhInstant(fromDate, "00:00").toISOString());
  if (error) fail(`Could not load appointments: ${error.message}`);
  return (data ?? []).map((a) => ({
    dentistId: a.dentist_id as number,
    start: new Date(a.starts_at),
    end: new Date(a.ends_at),
  }));
}

/** Free start times for a service, per dentist, for one or more days. */
export async function checkAvailability(input: {
  service_id: number;
  date: string;
  dentist_id?: number;
  days?: number;
}) {
  const problem = checkBookableDate(input.date);
  if (problem) return { ok: false as const, error: problem };

  const catalog = await getCatalog();
  const service = catalog.services.find((s) => s.id === input.service_id);
  if (!service) return { ok: false as const, error: "Unknown service_id." };

  const dentists = catalog.dentists.filter(
    (d) => d.serviceIds.includes(service.id) && (input.dentist_id === undefined || d.id === input.dentist_id),
  );
  if (dentists.length === 0) {
    return { ok: false as const, error: "No dentist offers this service (or that dentist doesn't provide it)." };
  }

  const days = Math.min(Math.max(input.days ?? 1, 1), 7);
  const lastDate = addDays(input.date, days - 1);
  const busy = await bookedPeriods(dentists.map((d) => d.id), input.date, lastDate);
  const notBefore = new Date(Date.now() + MIN_NOTICE_MINUTES * 60_000);

  const results = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(input.date, i);
    const weekday = weekdayOf(date);
    results.push({
      date,
      weekday: weekdayName(date),
      dentists: dentists.map((d) => {
        const hours = d.workingDays.find((w) => w.weekday === weekday) ?? null;
        return {
          dentist_id: d.id,
          dentist: d.name,
          free_start_times: freeSlots({
            date,
            durationMinutes: service.duration_minutes,
            hours,
            busy: busy.filter((b) => b.dentistId === d.id),
            notBefore,
          }),
          works_this_day: hours !== null,
        };
      }),
    });
  }

  return {
    ok: true as const,
    service: service.name,
    duration_minutes: service.duration_minutes,
    price_sar: service.price_sar,
    days: results,
  };
}

export interface BookingRequest {
  service_id: number;
  dentist_id: number;
  date: string;
  time: string;
  patient_name: string;
  patient_phone: string;
  notes?: string;
}

/**
 * Checks a booking without saving it: valid phone and name, dentist offers the
 * service, and the time is free. Used to read the details back to the patient.
 */
export async function prepareBooking(input: BookingRequest) {
  const phone = normalizeSaudiMobile(input.patient_phone);
  if (!phone) return { ok: false as const, error: "Invalid phone number. Ask for a Saudi mobile number like 05XXXXXXXX (10 digits)." };
  const name = input.patient_name.trim();
  if (name.length < 2) return { ok: false as const, error: "Please ask for the patient's name." };
  if (!isValidTime(input.time)) return { ok: false as const, error: "Invalid time. Use 24-hour HH:MM." };

  const availability = await checkAvailability({
    service_id: input.service_id,
    dentist_id: input.dentist_id,
    date: input.date,
  });
  if (!availability.ok) return availability;
  const slots = availability.days[0].dentists[0]?.free_start_times ?? [];
  if (!slots.includes(input.time)) {
    return {
      ok: false as const,
      error: "That time is not available.",
      other_free_times_that_day: slots.slice(0, 6),
    };
  }
  return {
    ok: true as const,
    status: "not booked yet: read these details to the patient and ask them to confirm",
    service: availability.service,
    dentist: availability.days[0].dentists[0].dentist,
    date: input.date,
    weekday: weekdayName(input.date),
    time: input.time,
    duration_minutes: availability.duration_minutes,
    price_sar: availability.price_sar,
    patient_name: name,
    patient_phone: phone,
  };
}

/** Books an appointment after re-checking every rule on the server. */
export async function bookAppointment(input: BookingRequest) {
  const phone = normalizeSaudiMobile(input.patient_phone);
  if (!phone) return { ok: false as const, error: "Invalid phone number. Ask for a Saudi mobile number like 05XXXXXXXX." };
  const name = input.patient_name.trim();
  if (name.length < 2) return { ok: false as const, error: "Please ask for the patient's name." };
  if (!isValidTime(input.time)) return { ok: false as const, error: "Invalid time. Use 24-hour HH:MM." };

  const availability = await checkAvailability({
    service_id: input.service_id,
    dentist_id: input.dentist_id,
    date: input.date,
  });
  if (!availability.ok) return availability;
  const slots = availability.days[0].dentists[0]?.free_start_times ?? [];
  if (!slots.includes(input.time)) {
    return {
      ok: false as const,
      error: "That time is not available.",
      other_free_times_that_day: slots.slice(0, 6),
    };
  }

  const startsAt = riyadhInstant(input.date, input.time);
  const endsAt = new Date(startsAt.getTime() + availability.duration_minutes * 60_000);
  const { data, error } = await db()
    .from("appointments")
    .insert({
      dentist_id: input.dentist_id,
      service_id: input.service_id,
      patient_name: name,
      patient_phone: phone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    // 23P01 = the database's no_double_booking rule: someone took the slot a moment ago
    if (error.code === "23P01") return { ok: false as const, error: "That time was just taken. Offer another time." };
    fail(`Could not save the booking: ${error.message}`);
  }

  return {
    ok: true as const,
    appointment_id: data.id,
    service: availability.service,
    dentist: availability.days[0].dentists[0].dentist,
    date: input.date,
    weekday: weekdayName(input.date),
    time: input.time,
    duration_minutes: availability.duration_minutes,
    price_sar: availability.price_sar,
    patient_name: name,
    patient_phone: phone,
  };
}

/** Upcoming booked appointments for a phone number. */
export async function findAppointments(input: { patient_phone: string }) {
  const phone = normalizeSaudiMobile(input.patient_phone);
  if (!phone) return { ok: false as const, error: "Invalid phone number. Ask for a Saudi mobile number like 05XXXXXXXX." };

  const { data, error } = await db()
    .from("appointments")
    .select("id, starts_at, patient_name, dentists(name), services(name)")
    .eq("patient_phone", phone)
    .eq("status", "booked")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");
  if (error) fail(`Could not look up appointments: ${error.message}`);

  return {
    ok: true as const,
    appointments: (data ?? []).map((a) => {
      const { date, time } = toRiyadh(new Date(a.starts_at));
      const dentist = a.dentists as unknown as { name: string } | null;
      const service = a.services as unknown as { name: string } | null;
      return {
        appointment_id: a.id,
        date,
        weekday: weekdayName(date),
        time,
        dentist: dentist?.name,
        service: service?.name,
        patient_name: a.patient_name,
      };
    }),
  };
}

/** Cancels an upcoming appointment, but only if the phone number matches it. */
export async function cancelAppointment(input: { appointment_id: number; patient_phone: string }) {
  const phone = normalizeSaudiMobile(input.patient_phone);
  if (!phone) return { ok: false as const, error: "Invalid phone number." };

  const { data, error } = await db()
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", input.appointment_id)
    .eq("patient_phone", phone)
    .eq("status", "booked")
    .gte("starts_at", new Date().toISOString())
    .select("id, starts_at, patient_name, patient_phone")
    .maybeSingle();
  if (error) fail(`Could not cancel: ${error.message}`);
  if (!data) {
    return {
      ok: false as const,
      guard: "wrong_phone_for_booking",
      error: "No upcoming booking with that ID for this phone number.",
    };
  }
  const { date, time } = toRiyadh(new Date(data.starts_at));
  return {
    ok: true as const,
    cancelled_appointment_id: data.id,
    date,
    weekday: weekdayName(date),
    time,
    patient_name: data.patient_name as string,
    patient_phone: data.patient_phone as string,
  };
}

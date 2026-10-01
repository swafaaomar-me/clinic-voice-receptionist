import { tool } from "ai";
import { z } from "zod";
import { normalizeSaudiMobile } from "./phone";
import { bookAppointment, cancelAppointment, checkAvailability, findAppointments, getClinicInfo, prepareBooking } from "./clinic";

const date = z.string().describe("Date in YYYY-MM-DD format (Riyadh time)");

const bookingInput = z.object({
  service_id: z.number().int(),
  dentist_id: z.number().int(),
  date: date,
  time: z.string().describe("Start time in 24-hour HH:MM, taken from check_availability"),
  patient_name: z.string().describe("Patient's full name"),
  patient_phone: z.string().describe("Patient's Saudi mobile number, e.g. 05XXXXXXXX"),
  notes: z.string().optional().describe("Anything the dentist should know, e.g. a symptom the patient mentioned"),
});



/** The booking the patient was shown in Noor's previous reply (from prepare_booking). */
export interface PreparedBooking {
  service_id: number;
  dentist_id: number;
  date: string;
  time: string;
  patient_phone: string;
}

/**
 * Creates Noor's tools for one request. book_appointment only works for the exact
 * booking that was read back to the patient in the previous reply.
 */
export function createReceptionistTools(prepared: PreparedBooking | null) {
  return {
    get_clinic_info: tool({
      description:
        "Get the clinic's location, phone number, opening hours, parking, payment, insurance and emergency information, in English and Arabic.",
      inputSchema: z.object({}),
      execute: async () => getClinicInfo(),
    }),

    check_availability: tool({
      description:
        "Find free appointment start times for a service. Checks every dentist who offers the service, or only one dentist if dentist_id is given. Can look up to 7 days ahead from the start date.",
      inputSchema: z.object({
        service_id: z.number().int().describe("The service_id from the services list"),
        date: date.describe("First day to check, YYYY-MM-DD"),
        dentist_id: z.number().int().optional().describe("Only check this dentist (optional)"),
        days: z.number().int().min(1).max(7).optional().describe("How many days to check from the start date (default 1)"),
      }),
      execute: async (input) => checkAvailability(input),
    }),

    prepare_booking: tool({
      description:
        "Check a booking's details WITHOUT saving it. Call this once you know the treatment, dentist, date, time, name and mobile number. Then read the returned details to the patient and ask them to confirm.",
      inputSchema: bookingInput,
      execute: async (input) => prepareBooking(input),
    }),

    book_appointment: tool({
      description:
        "Save the booking. Only available after prepare_booking succeeded in your previous reply and the patient has now confirmed. Use exactly the same details.",
      inputSchema: bookingInput,
      execute: async (input) => {
        if (!prepared) {
          return { ok: false as const, error: "Not booked. Call prepare_booking first and ask the patient to confirm." };
        }
        const sameBooking =
          input.service_id === prepared.service_id &&
          input.dentist_id === prepared.dentist_id &&
          input.date === prepared.date &&
          input.time === prepared.time &&
          normalizeSaudiMobile(input.patient_phone) === prepared.patient_phone;
        if (!sameBooking) {
          return {
            ok: false as const,
            error: "Not booked: these details differ from what the patient confirmed. Call prepare_booking with the new details and ask again.",
          };
        }
        return bookAppointment(input);
      },
    }),

    find_appointments: tool({
      description: "List the upcoming appointments booked with a mobile number.",
      inputSchema: z.object({
        patient_phone: z.string().describe("The mobile number used for the booking"),
      }),
      execute: async (input) => findAppointments(input),
    }),

    cancel_appointment: tool({
      description:
        "Cancel one upcoming appointment. Use an appointment_id from find_appointments, and only after the patient confirms which appointment to cancel.",
      inputSchema: z.object({
        appointment_id: z.number().int(),
        patient_phone: z.string().describe("The mobile number used for the booking"),
      }),
      execute: async (input) => cancelAppointment(input),
    }),
  };
}

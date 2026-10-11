import { to12Hour } from "./opening-hours";
import { addDays, weekdayName } from "./time";

// Day-before appointment reminders that staff send from their own WhatsApp.
// No paid SMS service: each button opens WhatsApp with the message already written.

export const CLINIC_PHONE = "011 555 0123";

const ARABIC_WEEKDAYS: Record<string, string> = {
  Sunday: "الأحد",
  Monday: "الاثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
  Friday: "الجمعة",
  Saturday: "السبت",
};

export type ReminderLang = "en" | "ar";

export interface ReminderDetails {
  patientName: string;
  date: string; // YYYY-MM-DD, Riyadh
  time: string; // HH:MM, Riyadh
  dentist: string;
  dentistAr: string;
  service: string;
  serviceAr: string;
}

/** Arabic names get an Arabic message by default; everyone else gets English. */
export function defaultLanguage(patientName: string): ReminderLang {
  return /[؀-ۿ]/.test(patientName) ? "ar" : "en";
}

/** The reminder text, in English or Arabic. `today` decides whether to say "tomorrow". */
export function reminderMessage(details: ReminderDetails, lang: ReminderLang, today: string): string {
  const firstName = details.patientName.trim().split(/\s+/)[0];
  const isTomorrow = details.date === addDays(today, 1);
  const weekday = weekdayName(details.date);
  const time = to12Hour(details.time);

  if (lang === "ar") {
    const arTime = `\u2066${time.replace(/ (AM|PM)$/, "")}\u2069 ${time.endsWith("AM") ? "صباحاً" : "مساءً"}`;
    const when = isTomorrow ? "بكرة" : `يوم ${ARABIC_WEEKDAYS[weekday]}`;
    return [
      `مرحباً ${firstName}، معك عيادة سمايل لطب الأسنان.`,
      `نذكّرك بموعدك ${when} الساعة ${arTime} مع ${details.dentistAr} (${details.serviceAr}).`,
      // The isolate marks keep the number in left-to-right order inside Arabic text
      `لتعديل الموعد أو إلغائه، تواصل معنا على \u2066${CLINIC_PHONE}\u2069.`,
      `نشوفك إن شاء الله!`,
    ].join("\n");
  }

  const day = new Date(`${details.date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const when = isTomorrow ? `tomorrow, ${weekday} ${day},` : `on ${weekday}, ${day},`;
  const service = details.service.charAt(0).toLowerCase() + details.service.slice(1);
  return [
    `Hi ${firstName}, this is Smile Dental Clinic.`,
    `Just a reminder of your ${service} appointment ${when} at ${time} with ${details.dentist}.`,
    `To change or cancel, please call us on ${CLINIC_PHONE}.`,
    `See you then!`,
  ].join("\n");
}

/** A link that opens WhatsApp (app or web) with the message ready to send to this Saudi mobile number. */
export function whatsappLink(saudiMobile: string, message: string): string {
  const international = `966${saudiMobile.replace(/\D/g, "").replace(/^0/, "")}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/admin-auth";
import { listReminders } from "@/lib/admin-data";
import { to12Hour } from "@/lib/opening-hours";
import { defaultLanguage, reminderMessage, whatsappLink } from "@/lib/reminders";
import { addDays, riyadhToday, toRiyadh } from "@/lib/time";
import { AdminHeader } from "../AdminHeader";
import { ReminderButton } from "./ReminderButton";

export const metadata: Metadata = { title: "Reminders | Smile Dental Clinic", robots: { index: false } };

function sentLabel(iso: string | null, today: string): string | null {
  if (!iso) return null;
  const { date, time } = toRiyadh(new Date(iso));
  return `Sent ${date === today ? "today" : date === addDays(today, -1) ? "yesterday" : date} at ${to12Hour(time)}`;
}

export default async function RemindersPage() {
  if (!(await isSignedIn())) redirect("/admin/login");

  const today = riyadhToday();
  const { date, closedDaysSkipped, appointments } = await listReminders();
  const sent = appointments.filter((a) => a.reminderSentAt).length;
  const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const isTomorrow = date === addDays(today, 1);

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader current="/admin/reminders" />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-[-0.01em]">Reminders</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Remind patients the day before their appointment. Each button opens WhatsApp with the message already written;
          just press send.
        </p>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">
            {isTomorrow ? "Tomorrow, " : ""}
            {dayLabel}
          </h2>
          {appointments.length > 0 && (
            <p className="text-sm text-ink-soft tabular-nums">
              {sent} of {appointments.length} sent
            </p>
          )}
        </div>
        {closedDaysSkipped.length > 0 && (
          <p className="mt-1 text-sm text-ink-soft">
            The clinic is closed on {closedDaysSkipped.join(" and ")}, so these are the next patients due.
          </p>
        )}

        {appointments.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
            No appointments on {dayLabel}, so there are no reminders to send.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
            {appointments.map((a) => {
              const messages = { ar: reminderMessage(a, "ar", today), en: reminderMessage(a, "en", today) };
              return (
                <li key={a.id} className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-[6rem_1fr_auto] sm:px-5">
                  <p className="font-semibold tabular-nums">{to12Hour(a.time)}</p>
                  <div>
                    <p className="font-medium">
                      <bdi>{a.patientName}</bdi>
                    </p>
                    <p className="text-sm text-ink-soft tabular-nums">{a.patientPhone}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {a.service} with {a.dentist}
                    </p>
                  </div>
                  <ReminderButton
                    id={a.id}
                    links={{ ar: whatsappLink(a.patientPhone, messages.ar), en: whatsappLink(a.patientPhone, messages.en) }}
                    messages={messages}
                    defaultLang={defaultLanguage(a.patientName)}
                    sentLabel={sentLabel(a.reminderSentAt, today)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/admin-auth";
import { listUpcomingAppointments, type StaffAppointment } from "@/lib/admin-data";
import { getCatalog } from "@/lib/clinic";
import { to12Hour } from "@/lib/opening-hours";
import { addDays, riyadhToday } from "@/lib/time";
import { signOut } from "./actions";
import { CancelButton } from "./CancelButton";

export const metadata: Metadata = { title: "Staff dashboard | Smile Dental Clinic", robots: { index: false } };

const DAYS_SHOWN = 14;

function dayHeading(date: string, today: string) {
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  if (date === today) return `Today, ${label}`;
  if (date === addDays(today, 1)) return `Tomorrow, ${label}`;
  return label;
}

function groupByDay(appointments: StaffAppointment[]) {
  const days = new Map<string, StaffAppointment[]>();
  for (const a of appointments) days.set(a.date, [...(days.get(a.date) ?? []), a]);
  return [...days.entries()];
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPage(props: { searchParams: SearchParams }) {
  if (!(await isSignedIn())) redirect("/admin/login");

  const params = await props.searchParams;
  const dentistParam = Number(Array.isArray(params.dentist) ? params.dentist[0] : params.dentist);
  const dentistId = Number.isInteger(dentistParam) && dentistParam > 0 ? dentistParam : undefined;

  const [catalog, appointments] = await Promise.all([
    getCatalog(),
    listUpcomingAppointments({ days: DAYS_SHOWN, dentistId }),
  ]);
  const today = riyadhToday();
  const next = appointments.find((a) => !a.isPast);
  const days = groupByDay(appointments);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="leading-tight">
            <p className="font-semibold">Smile Dental Clinic</p>
            <p className="text-sm text-ink-soft">Staff dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="hidden whitespace-nowrap rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink sm:inline-block">
              View website
            </Link>
            <form action={signOut}>
              <button type="submit" className="whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm hover:border-ink/40">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-[-0.01em]">Appointments</h1>
        {next && (
          <section
            aria-label="Next appointment"
            className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-gum/25 bg-paper px-5 py-4"
          >
            <p className="text-sm font-medium text-gum">Next up</p>
            <p className="text-lg font-semibold tabular-nums">
              {to12Hour(next.start)}
              {next.date !== today && (
                <span className="ml-2 text-sm font-normal text-ink-soft">
                  {dayHeading(next.date, today).replace(/^Today, .*/, "")}
                </span>
              )}
            </p>
            <p className="font-medium">
              <bdi>{next.patientName}</bdi>
            </p>
            <p className="text-ink-soft">
              {next.service} with {next.dentist}
            </p>
          </section>
        )}

        <nav aria-label="Filter by dentist" className="mt-6 flex flex-wrap gap-2">
          {[{ id: undefined, name: "All dentists" }, ...catalog.dentists.map((d) => ({ id: d.id, name: d.name }))].map(
            (d) => {
              const active = d.id === dentistId;
              return (
                <Link
                  key={d.name}
                  href={d.id ? `/admin?dentist=${d.id}` : "/admin"}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm ${
                    active ? "bg-ink text-white" : "border border-line bg-paper hover:border-ink/40"
                  }`}
                >
                  {d.name}
                </Link>
              );
            },
          )}
        </nav>

        {days.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
            No appointments booked for the next {DAYS_SHOWN} days. New bookings from Noor appear here automatically.
          </p>
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            {days.map(([date, list]) => (
              <section key={date} aria-labelledby={`day-${date}`}>
                <h2 id={`day-${date}`} className="text-lg font-semibold">
                  {dayHeading(date, today)}
                  <span className="ml-2 text-sm font-normal text-ink-soft">{list.length} booked</span>
                </h2>
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
                  {list.map((a) => (
                    <li
                      key={a.id}
                      className={`grid gap-x-6 gap-y-1 px-4 py-4 sm:grid-cols-[7.5rem_1fr_1fr_auto] sm:items-center sm:px-5 ${
                        a.isPast ? "opacity-55" : ""
                      }`}
                    >
                      <p className="font-semibold tabular-nums">
                        {to12Hour(a.start)}
                        <span className="block text-sm font-normal text-ink-soft">to {to12Hour(a.end)}</span>
                      </p>
                      <div>
                        <p className="font-medium">
                          <bdi>{a.patientName}</bdi>
                        </p>
                        <p className="text-sm tabular-nums text-ink-soft">{a.patientPhone}</p>
                        {a.notes && (
                          <p className="mt-1 text-sm text-ink-soft">
                            Note: <bdi>{a.notes}</bdi>
                          </p>
                        )}
                      </div>
                      <div>
                        <p>{a.service}</p>
                        <p className="text-sm text-ink-soft">
                          {a.dentist}, {a.priceSar.toLocaleString("en-US")} SAR
                        </p>
                      </div>
                      <div className="sm:justify-self-end">
                        {a.isPast ? (
                          <span className="text-sm text-ink-soft">Done</span>
                        ) : (
                          <CancelButton id={a.id} label={`${a.patientName}'s appointment at ${to12Hour(a.start)}`} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/admin-auth";
import { alertsAreSetUp } from "@/lib/alerts";
import { to12Hour } from "@/lib/opening-hours";
import {
  CHAT_LIMITS,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
  SECURITY_FILTERS,
  SECURITY_KINDS,
  listSecurityEvents,
} from "@/lib/security";
import { addDays, riyadhToday, toRiyadh } from "@/lib/time";
import { AdminHeader } from "../AdminHeader";

export const metadata: Metadata = { title: "Security | Smile Dental Clinic", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SEVERITY_STYLE = {
  high: "bg-gum text-white",
  warning: "bg-blush text-gum-dark",
  info: "bg-enamel text-ink-soft",
};

function when(iso: string) {
  const { date, time } = toRiyadh(new Date(iso));
  const today = riyadhToday();
  const day =
    date === today
      ? "Today"
      : date === addDays(today, -1)
        ? "Yesterday"
        : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return `${day}, ${to12Hour(time)}`;
}

export default async function SecurityPage(props: { searchParams: SearchParams }) {
  if (!(await isSignedIn())) redirect("/admin/login");

  const params = await props.searchParams;
  const requested = Array.isArray(params.show) ? params.show[0] : params.show;
  const filter = requested && requested in SECURITY_FILTERS ? requested : undefined;
  const events = await listSecurityEvents({ filter });
  const alertsOn = alertsAreSetUp();

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader current="/admin/security" />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-[-0.01em]">Security</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Suspicious activity on the website, newest first. Serious events are blocked automatically
          {alertsOn ? " and sent to the admin's phone straight away." : "."}
        </p>

        <details className="mt-4 max-w-2xl rounded-xl border border-line bg-paper px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">What is protected</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
            <li>
              Staff sign-in locks for {LOGIN_LOCK_MINUTES} minutes after {LOGIN_MAX_FAILURES} wrong passwords from one device.
            </li>
            <li>Each device can send at most {CHAT_LIMITS.map((l) => l.label).join(", or ")} to Noor.</li>
            <li>Very long messages and oversized requests are refused.</li>
            <li>Messages that try to trick Noor are recorded. Her code checks still stop anything unsafe.</li>
            <li>
              Visitors are identified by a short device code made from their IP address. The full address is never
              stored.
            </li>
          </ul>
          {!alertsOn && (
            <p className="mt-3 text-gum-dark">
              Instant alerts are off. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to the settings to turn them on.
            </p>
          )}
        </details>

        <nav aria-label="Filter events" className="mt-6 flex flex-wrap gap-2">
          {[{ key: undefined, label: "All" }, ...Object.entries(SECURITY_FILTERS).map(([key, f]) => ({ key, label: f.label }))].map(
            (f) => {
              const active = f.key === filter;
              return (
                <Link
                  key={f.label}
                  href={f.key ? `/admin/security?show=${f.key}` : "/admin/security"}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm ${
                    active ? "bg-ink text-white" : "border border-line bg-paper hover:border-ink/40"
                  }`}
                >
                  {f.label}
                </Link>
              );
            },
          )}
        </nav>

        {events.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
            {filter ? "Nothing of this kind so far." : "All quiet. Nothing suspicious has happened yet."}
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
            {events.map((e) => {
              const kind = SECURITY_KINDS[e.kind];
              return (
                <li key={e.id} className="grid gap-x-6 gap-y-2 px-4 py-4 sm:grid-cols-[9.5rem_1fr_auto] sm:px-5">
                  <div className="text-sm text-ink-soft">
                    <p className="font-medium text-ink tabular-nums">{when(e.createdAt)}</p>
                    <p className="tabular-nums">
                      Device {e.device}
                      {e.ipHint ? <span className="block">{e.ipHint}</span> : null}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">{kind?.label ?? e.kind}</p>
                    <p className="mt-0.5 break-words leading-relaxed text-ink-soft">
                      <bdi>{e.details}</bdi>
                    </p>
                    {e.notified && <p className="mt-1 text-sm text-open">Alert sent to the admin&apos;s phone</p>}
                  </div>
                  <p className="sm:justify-self-end">
                    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${SEVERITY_STYLE[e.severity]}`}>
                      {e.severity === "high" ? "High" : e.severity === "warning" ? "Warning" : "Info"}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

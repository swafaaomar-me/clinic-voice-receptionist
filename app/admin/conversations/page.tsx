import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/admin-auth";
import { listConversations } from "@/lib/conversations";
import { addDays, riyadhToday, toRiyadh } from "@/lib/time";
import { to12Hour } from "@/lib/opening-hours";
import { AdminHeader } from "../AdminHeader";

export const metadata: Metadata = { title: "Conversations | Smile Dental Clinic", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const OUTCOMES: Record<string, { label: string; style: string }> = {
  booked: { label: "Booked", style: "bg-[#e3f2ea] text-open" },
  cancelled: { label: "Cancelled", style: "bg-enamel text-ink-soft" },
  question: { label: "Question", style: "bg-[#e6eef1] text-ink" },
  emergency: { label: "Emergency", style: "bg-blush text-gum-dark" },
  no_action: { label: "No action", style: "bg-enamel text-ink-soft" },
};

const LANGUAGES: Record<string, string> = { en: "English", ar: "Arabic", mixed: "English and Arabic" };

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

export default async function ConversationsPage(props: { searchParams: SearchParams }) {
  if (!(await isSignedIn())) redirect("/admin/login");

  const params = await props.searchParams;
  const requested = Array.isArray(params.outcome) ? params.outcome[0] : params.outcome;
  const outcome = requested && requested in OUTCOMES ? requested : undefined;
  const conversations = await listConversations({ outcome });

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader current="/admin/conversations" />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-[-0.01em]">Conversations</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          A short note on every chat with Noor, newest first. Bookings and cancellations come from what Noor actually did;
          the summary text is written by AI.
        </p>

        <nav aria-label="Filter by outcome" className="mt-6 flex flex-wrap gap-2">
          {[{ key: undefined, label: "All" }, ...Object.entries(OUTCOMES).map(([key, o]) => ({ key, label: o.label }))].map(
            (f) => {
              const active = f.key === outcome;
              return (
                <Link
                  key={f.label}
                  href={f.key ? `/admin/conversations?outcome=${f.key}` : "/admin/conversations"}
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

        {conversations.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
            {outcome
              ? "No conversations with this outcome yet."
              : "No conversations yet. Each chat with Noor will appear here a few seconds after it happens."}
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
            {conversations.map((c) => {
              const o = OUTCOMES[c.outcome] ?? OUTCOMES.question;
              return (
                <li key={c.id} className="grid gap-x-6 gap-y-2 px-4 py-4 sm:grid-cols-[9.5rem_1fr_auto] sm:px-5">
                  <div className="text-sm text-ink-soft">
                    <p className="font-medium text-ink tabular-nums">{when(c.updatedAt)}</p>
                    <p>
                      {c.messageCount} messages{c.language ? `, ${LANGUAGES[c.language] ?? c.language}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="leading-relaxed">{c.summary}</p>
                    {(c.patientName || c.patientPhone) && (
                      <p className="mt-1 text-sm text-ink-soft">
                        <bdi>{c.patientName ?? "Unknown name"}</bdi>
                        {c.patientPhone ? `, ${c.patientPhone}` : ""}
                      </p>
                    )}
                  </div>
                  <p className="sm:justify-self-end">
                    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${o.style}`}>{o.label}</span>
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

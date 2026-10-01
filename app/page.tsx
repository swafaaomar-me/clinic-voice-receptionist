import Link from "next/link";
import { connection } from "next/server";
import { getCatalog, getClinicInfo } from "@/lib/clinic";
import { clinicHoursOn, clinicStatus, to12Hour } from "@/lib/opening-hours";
import { riyadhToday, weekdayOf } from "@/lib/time";
import { NoorConversation } from "./_components/NoorConversation";
import { WeekStrip } from "./_components/WeekStrip";
import { ChatWidget } from "./_components/ChatWidget";
import { TalkToNoorButton } from "./_components/TalkToNoorButton";

const WEEK = [
  { weekday: 6, name: "Saturday" },
  { weekday: 0, name: "Sunday" },
  { weekday: 1, name: "Monday" },
  { weekday: 2, name: "Tuesday" },
  { weekday: 3, name: "Wednesday" },
  { weekday: 4, name: "Thursday" },
  { weekday: 5, name: "Friday" },
];

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // the clinic's week starts on Saturday

/** One line per schedule: ["9:00 AM to 5:00 PM"], or ["Sat 10:00 AM to 2:00 PM", "Sun, Tue, Thu 10:00 AM to 6:00 PM"]. */
function describeHours(days: { weekday: number; start: string; end: string }[]): string[] {
  const groups = new Map<string, number[]>();
  for (const d of [...days].sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday))) {
    const range = `${to12Hour(d.start)} to ${to12Hour(d.end)}`;
    groups.set(range, [...(groups.get(range) ?? []), d.weekday]);
  }
  if (groups.size === 1) return [...groups.keys()];
  return [...groups.entries()].map(([range, wds]) => `${wds.map((w) => SHORT_DAY[w]).join(", ")} ${range}`);
}

function shortDoctorName(name: string) {
  // "Dr. Sara Al-Harbi" -> "Dr. Sara"
  return name.split(" ").slice(0, 2).join(" ");
}

export default async function Home() {
  await connection(); // always show today's live data, never a cached copy
  const [catalog, info] = await Promise.all([getCatalog(), getClinicInfo()]);

  const status = clinicStatus(catalog);
  const todayWeekday = weekdayOf(riyadhToday());
  const infoText = (topic: string) => info.find((i) => i.topic === topic)?.content ?? "";
  const phone = infoText("phone").match(/[\d ]{9,}/)?.[0].trim() ?? "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" className="leading-tight">
          <span className="block text-lg font-semibold">Smile Dental Clinic</span>
          <span lang="ar" dir="rtl" className="block text-left text-sm text-ink-soft">
            عيادة سمايل لطب الأسنان
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-[15px] text-ink-soft md:flex">
          <a href="#treatments" className="hover:text-ink">Treatments</a>
          <a href="#dentists" className="hover:text-ink">Dentists</a>
          <a href="#visit" className="hover:text-ink">Visit us</a>
        </nav>
        <TalkToNoorButton className="rounded-full bg-gum px-5 py-2.5 text-[15px] font-medium text-white hover:bg-gum-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gum" />
      </header>

      <main className="flex-1">
        {/* Hero: the thing that makes this clinic different */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div className="max-w-xl">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-sm">
              <span
                aria-hidden
                className={`size-2 rounded-full ${status.isOpen ? "bg-open" : "bg-ink-soft/50"}`}
              />
              <span className={status.isOpen ? "text-open" : "text-ink-soft"}>{status.label}</span>
            </p>
            <h1 className="text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.02em] text-balance sm:text-6xl">
              Talk to Noor. She&apos;ll find you a time.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-soft">
              Noor is our AI receptionist. Ask her about treatments and prices, or book, check and
              cancel appointments, in English or Arabic, any time of day.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <TalkToNoorButton className="rounded-full bg-gum px-7 py-3.5 text-base font-medium text-white hover:bg-gum-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gum" />
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  className="rounded-full border border-ink/15 px-7 py-3.5 text-base font-medium hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  Call {phone}
                </a>
              )}
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <NoorConversation />
          </div>
        </section>

        {/* Treatments, laid out like a price list */}
        <section id="treatments" className="border-t border-line bg-paper">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">Treatments and prices</h2>
              <p className="mt-3 text-ink-soft">All prices are in Saudi riyals. Noor can tell you which dentist is free first.</p>
            </div>
            <ul className="mt-10 divide-y divide-line border-y border-line">
              {catalog.services.map((service) => {
                const dentists = catalog.dentists.filter((d) => d.serviceIds.includes(service.id));
                return (
                  <li
                    key={service.id}
                    className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_7rem]"
                  >
                    <div>
                      <p className="text-lg font-medium">{service.name}</p>
                      <p className="mt-0.5 text-sm text-ink-soft">{service.description}</p>
                    </div>
                    <p className="order-last col-span-2 text-sm text-ink-soft sm:order-none sm:col-span-1">
                      <span lang="ar" dir="rtl">{service.name_ar}</span>
                      <span className="mx-2 text-line">|</span>
                      {dentists.map((d) => shortDoctorName(d.name)).join(", ")}
                    </p>
                    <p className="hidden text-ink-soft tabular-nums sm:block">{service.duration_minutes} min</p>
                    <p className="text-right text-lg font-semibold tabular-nums">
                      {service.price_sar.toLocaleString("en-US")} SAR
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Dentists and the days they work */}
        <section id="dentists" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">Our dentists</h2>
          {/* Each dentist spans the same 4 rows, so names, days, hours and treatments line up across columns */}
          <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-x-8 md:gap-y-4">
            {catalog.dentists.map((dentist) => {
              const services = catalog.services.filter((s) => dentist.serviceIds.includes(s.id));
              const schedule = describeHours(dentist.workingDays);
              return (
                <article key={dentist.id} className="grid gap-4 md:row-span-4 md:grid-rows-subgrid">
                  <div>
                    <h3 className="text-xl font-semibold">{dentist.name}</h3>
                    <p lang="ar" dir="rtl" className="text-left text-ink-soft">
                      {dentist.name_ar}
                    </p>
                    <p className="mt-1 font-medium text-gum-dark">{dentist.specialty}</p>
                  </div>
                  <WeekStrip workingDays={dentist.workingDays.map((w) => w.weekday)} />
                  <p className="text-sm leading-relaxed text-ink-soft">
                    {schedule.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </p>
                  <p className="text-sm leading-relaxed">{services.map((s) => s.name).join(", ")}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Opening hours and practical details */}
        <section id="visit" className="border-t border-line bg-paper">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 sm:px-8 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">Opening hours</h2>
              <table className="mt-8 w-full max-w-sm text-[15px]">
                <tbody>
                  {WEEK.map((day) => {
                    const hours = clinicHoursOn(catalog, day.weekday);
                    const isToday = day.weekday === todayWeekday;
                    return (
                      <tr key={day.weekday} className={`border-b border-line ${isToday ? "font-semibold" : ""}`}>
                        <th scope="row" className="py-3 text-left font-[inherit]">
                          {day.name}
                          {isToday && <span className="ml-2 text-sm font-normal text-gum">today</span>}
                        </th>
                        <td className="py-3 text-right tabular-nums">
                          {hours ? `${to12Hour(hours.open)} to ${to12Hour(hours.close)}` : "Closed"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">Visit us</h2>
              <dl className="mt-8 grid gap-6 text-[15px] leading-relaxed">
                {[
                  ["Address", infoText("location")],
                  ["Phone and WhatsApp", phone],
                  ["Parking", infoText("parking")],
                  ["Payment", infoText("payment")],
                  ["Insurance", infoText("insurance")],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="font-semibold">{label}</dt>
                      <dd className="text-ink-soft">{value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-ink-soft sm:flex-row sm:justify-between sm:px-8">
          <p>Smile Dental Clinic is a fictional clinic, made for a portfolio project.</p>
          <p>Built by Swafaa Salim Said Omar</p>
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}

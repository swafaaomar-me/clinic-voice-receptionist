// Shows which days of the week a dentist works. Friday is always closed.

const DAYS = [
  { weekday: 6, short: "Sat" },
  { weekday: 0, short: "Sun" },
  { weekday: 1, short: "Mon" },
  { weekday: 2, short: "Tue" },
  { weekday: 3, short: "Wed" },
  { weekday: 4, short: "Thu" },
  { weekday: 5, short: "Fri" },
];

export function WeekStrip({ workingDays }: { workingDays: number[] }) {
  return (
    <ul className="flex gap-1" aria-label="Working days">
      {DAYS.map((day) => {
        const works = workingDays.includes(day.weekday);
        return (
          <li
            key={day.weekday}
            className={`flex h-8 flex-1 items-center justify-center rounded-md text-xs ${
              works ? "bg-blush font-semibold text-gum-dark" : "text-ink-soft/60 line-through decoration-ink-soft/30"
            }`}
          >
            <span className="sr-only">{works ? "Works " : "Off "}</span>
            {day.short}
          </li>
        );
      })}
    </ul>
  );
}

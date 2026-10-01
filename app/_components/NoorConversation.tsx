// An example conversation shown in the hero. It plays once, one line at a time.

type Line = { from: "patient" | "noor"; text: string };

const LINES: Line[] = [
  { from: "patient", text: "Can I get a teeth cleaning on Thursday morning?" },
  { from: "noor", text: "Of course. Dr. Sara has 9:00 AM free, and Dr. Lina has 10:00 AM. Which suits you?" },
  { from: "patient", text: "Dr. Sara at 9, please. I'm Reem, 055 123 4567." },
  { from: "noor", text: "Teeth cleaning with Dr. Sara on Thursday at 9:00 AM, 250 SAR. Shall I book it?" },
  { from: "patient", text: "Yes please" },
];

const STEP_MS = 650;

export function NoorConversation() {
  return (
    <figure className="w-full max-w-md rounded-[28px] border border-line bg-paper p-5 shadow-[0_24px_60px_-30px_rgba(15,42,51,0.35)] sm:p-6">
      <figcaption className="mb-5 flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-full bg-blush text-lg font-semibold text-gum"
        >
          ن
        </span>
        <span className="leading-tight">
          <span className="block font-semibold">Noor</span>
          <span className="block text-sm text-ink-soft">Example conversation</span>
        </span>
      </figcaption>

      <ol className="flex flex-col gap-3">
        {LINES.map((line, i) => (
          <li
            key={i}
            className={`convo-line max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug ${
              line.from === "patient"
                ? "self-end rounded-br-md bg-ink text-white"
                : "self-start rounded-bl-md bg-blush text-ink"
            }`}
            style={{ animationDelay: `${i * STEP_MS}ms` }}
          >
            <span className="sr-only">{line.from === "patient" ? "Patient: " : "Noor: "}</span>
            {line.text}
          </li>
        ))}
        <li
          className="convo-line mt-1 self-start rounded-xl border border-gum/30 px-4 py-2.5 text-sm"
          style={{ animationDelay: `${LINES.length * STEP_MS}ms` }}
        >
          <span className="font-semibold text-gum">Booked</span>
          <span className="text-ink-soft"> Thursday 9:00 AM with Dr. Sara Al-Harbi</span>
        </li>
      </ol>
    </figure>
  );
}

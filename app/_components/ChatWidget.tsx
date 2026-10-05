"use client";

import { useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { to12Hour } from "@/lib/opening-hours";
import { OPEN_NOOR_EVENT } from "./TalkToNoorButton";

const SUGGESTIONS = [
  "I'd like to book a teeth cleaning",
  "What are your opening hours?",
  "How much is teeth whitening?",
  "أبغى موعد فحص",
];

// What Noor is doing while a tool runs
const WORKING_LABELS: Record<string, string> = {
  get_clinic_info: "Looking up clinic information…",
  check_availability: "Checking available times…",
  prepare_booking: "Checking the booking details…",
  book_appointment: "Booking your appointment…",
  find_appointments: "Looking up your appointments…",
  cancel_appointment: "Cancelling the appointment…",
};

interface BookingOutput {
  ok: true;
  service: string;
  dentist: string;
  date: string;
  time: string;
  price_sar: number;
}

interface CancelOutput {
  ok: true;
  date: string;
  time: string;
}

function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Renders one part of a message: text, a "working…" line, or a confirmation card. */
function MessagePart({ part }: { part: UIMessage["parts"][number] }) {
  if (part.type === "text") {
    return part.text ? <p className="whitespace-pre-wrap">{part.text}</p> : null;
  }
  if (!isToolUIPart(part)) return null;

  const name = getToolName(part);
  if (part.state === "input-streaming" || part.state === "input-available") {
    return <p className="text-sm italic text-ink-soft">{WORKING_LABELS[name] ?? "Working…"}</p>;
  }
  if (part.state !== "output-available") return null;

  const output = part.output as { ok?: boolean } | undefined;
  if (name === "book_appointment" && output?.ok) {
    const booking = output as BookingOutput;
    return (
      <div className="mt-1 rounded-xl border border-gum/25 bg-paper p-3 text-sm text-ink" dir="ltr">
        <p className="font-semibold text-gum">Appointment booked</p>
        <p className="mt-1 font-medium">{booking.service}</p>
        <p className="text-ink-soft">{booking.dentist}</p>
        <p className="text-ink-soft">
          {formatDay(booking.date)} at {to12Hour(booking.time)}
        </p>
        <p className="mt-1 font-medium tabular-nums">{booking.price_sar.toLocaleString("en-US")} SAR</p>
      </div>
    );
  }
  if (name === "cancel_appointment" && output?.ok) {
    const cancelled = output as CancelOutput;
    return (
      <div className="mt-1 rounded-xl border border-line bg-paper p-3 text-sm text-ink" dir="ltr">
        <p className="font-semibold">Appointment cancelled</p>
        <p className="text-ink-soft">
          {formatDay(cancelled.date)} at {to12Hour(cancelled.time)}
        </p>
      </div>
    );
  }
  return null;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // Each conversation gets its own ID, so "New chat" starts a separate summary for staff
  const [chatId, setChatId] = useState(() => crypto.randomUUID());
  const { messages, sendMessage, status, error, regenerate, stop } = useChat({ id: chatId });
  const busy = status === "submitted" || status === "streaming";
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Open when any "Talk to Noor" button is pressed, optionally sending a first message
  useEffect(() => {
    function onOpen(event: Event) {
      setOpen(true);
      const message = (event as CustomEvent<string | undefined>).detail;
      if (message) sendMessage({ text: message });
    }
    window.addEventListener(OPEN_NOOR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_NOOR_EVENT, onOpen);
  }, [sendMessage]);

  // Focus the message box when the panel opens, and close it with Escape
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  const last = messages[messages.length - 1];
  const waitingForReply =
    status === "submitted" ||
    (status === "streaming" && last?.role === "assistant" && !last.parts.some((p) => p.type === "text" && p.text));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink py-3 pl-3 pr-5 text-[15px] font-medium text-white shadow-[0_12px_30px_-10px_rgba(15,42,51,0.6)] hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-blush font-semibold text-gum">
          ن
        </span>
        Talk to Noor
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Chat with Noor, Smile Dental Clinic's receptionist"
      className="fixed inset-0 z-50 flex flex-col bg-paper sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[400px] sm:rounded-[24px] sm:border sm:border-line sm:shadow-[0_24px_60px_-20px_rgba(15,42,51,0.45)]"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-blush font-semibold text-gum">
          ن
        </span>
        <div className="flex-1 leading-tight">
          <p className="font-semibold">Noor</p>
          <p className="text-sm text-ink-soft">AI receptionist</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              stop();
              setChatId(crypto.randomUUID());
            }}
            className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-enamel hover:text-ink"
          >
            New chat
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          className="grid size-9 place-items-center rounded-full text-xl text-ink-soft hover:bg-enamel hover:text-ink"
        >
          ×
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
        <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-blush px-4 py-2.5 text-[15px] leading-snug">
          Hi, I&apos;m Noor. I can answer questions about the clinic, and book, check or cancel appointments. How can I
          help?
        </div>

        {messages.length === 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                dir="auto"
                onClick={() => send(s)}
                className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-gum/40 hover:text-gum-dark"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => {
          const parts = message.parts.filter((p) => p.type === "text" || isToolUIPart(p));
          if (parts.length === 0) return null;
          return (
            <div
              key={message.id}
              dir="auto"
              className={`flex max-w-[85%] flex-col gap-1.5 rounded-2xl px-4 py-2.5 text-[15px] leading-snug ${
                message.role === "user"
                  ? "self-end rounded-br-md bg-ink text-white"
                  : "self-start rounded-bl-md bg-blush text-ink"
              }`}
            >
              {parts.map((part, i) => (
                <MessagePart key={i} part={part} />
              ))}
            </div>
          );
        })}

        {waitingForReply && (
          <div className="flex gap-1 self-start rounded-2xl rounded-bl-md bg-blush px-4 py-3.5" aria-label="Noor is typing">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-2 animate-bounce rounded-full bg-gum/60 motion-reduce:animate-none"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="self-start rounded-xl border border-gum/30 px-4 py-3 text-sm">
            <p>Noor couldn&apos;t reply just now. This usually clears up in a moment.</p>
            <button type="button" onClick={() => regenerate()} className="mt-2 font-medium text-gum hover:underline">
              Try again
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="noor-message" className="sr-only">
          Message Noor
        </label>
        <input
          id="noor-message"
          ref={inputRef}
          value={input}
          dir="auto"
          autoComplete="off"
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder="Type in English or Arabic…"
          className="min-w-0 flex-1 rounded-full border border-line bg-enamel px-4 py-2.5 text-[15px] outline-none focus:border-ink/40"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-gum px-5 text-[15px] font-medium text-white hover:bg-gum-dark disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}

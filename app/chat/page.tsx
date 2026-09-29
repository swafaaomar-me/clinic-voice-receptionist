"use client";

// A simple test page for talking to the receptionist by text.
// The real clinic website and chat widget come in week 2.

import { useChat } from "@ai-sdk/react";
import { isToolUIPart, getToolName } from "ai";
import { useState } from "react";

const TOOL_LABELS: Record<string, string> = {
  get_clinic_info: "Looked up clinic information",
  check_availability: "Checked available times",
  prepare_booking: "Checked the booking details (not booked yet)",
  book_appointment: "Booked the appointment",
  find_appointments: "Looked up appointments",
  cancel_appointment: "Cancelled the appointment",
};

const FAILED_LABELS: Record<string, string> = {
  get_clinic_info: "Couldn't look up clinic information",
  check_availability: "Couldn't check times",
  prepare_booking: "Booking details not valid",
  book_appointment: "Booking refused",
  find_appointments: "Couldn't look up appointments",
  cancel_appointment: "Cancellation refused",
};

export default function TestChat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat();
  const busy = status === "submitted" || status === "streaming";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Smile Dental Clinic: receptionist test chat</h1>
        <p className="text-sm text-zinc-500">
          Try: &quot;I&apos;d like a teeth cleaning next Sunday&quot; or &quot;أبغى موعد فحص بكرة&quot;
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "self-end rounded-2xl bg-teal-700 px-4 py-2 text-white"
                : "self-start rounded-2xl bg-zinc-100 px-4 py-2 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }
            dir="auto"
          >
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <p key={i} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                );
              }
              if (isToolUIPart(part)) {
                const name = getToolName(part);
                const output = part.state === "output-available" ? (part.output as { ok?: boolean } | undefined) : undefined;
                // A tool can run fine but still refuse the request (ok: false), e.g. an invalid phone number
                const failed = part.state === "output-error" || output?.ok === false;
                return (
                  <details key={i} className="my-1 text-xs text-zinc-500">
                    <summary className="cursor-pointer">
                      {failed ? "✗ " : "✓ "}
                      {failed ? FAILED_LABELS[name] ?? `${name} failed` : TOOL_LABELS[name] ?? name}
                    </summary>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify({ input: part.input, output: "output" in part ? part.output : undefined, error: failed ? part.errorText : undefined }, null, 2)}
                    </pre>
                  </details>
                );
              }
              return null;
            })}
          </div>
        ))}
        {busy && <p className="text-sm text-zinc-500">Noor is typing…</p>}
        {error && (
          <p className="text-sm text-red-600">
            Something went wrong: {error.message}. Check the terminal for details.
          </p>
        )}
      </div>

      <form
        className="sticky bottom-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={input}
          dir="auto"
          placeholder="Type a message…"
          onChange={(e) => setInput(e.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-teal-700 px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { ReminderLang } from "@/lib/reminders";
import { reminderSent } from "../actions";

const LANG_LABEL: Record<ReminderLang, string> = { ar: "عربي", en: "English" };

/** Opens WhatsApp with the reminder ready to send, and records that it was sent. */
export function ReminderButton(props: {
  id: number;
  links: Record<ReminderLang, string>;
  messages: Record<ReminderLang, string>;
  defaultLang: ReminderLang;
  sentLabel: string | null;
}) {
  const [lang, setLang] = useState<ReminderLang>(props.defaultLang);
  const [pending, startTransition] = useTransition();
  const other: ReminderLang = lang === "ar" ? "en" : "ar";

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex items-center gap-2">
        <a
          href={props.links[lang]}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => startTransition(() => reminderSent(props.id))}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
            props.sentLabel ? "border border-line text-ink hover:border-ink/40" : "bg-open text-white hover:bg-open/90"
          }`}
        >
          {props.sentLabel ? "Send again" : "Send on WhatsApp"}
        </a>
        <button
          type="button"
          onClick={() => setLang(other)}
          className="rounded-full px-2 py-1 text-sm text-ink-soft hover:text-ink"
          aria-label={`Write the message in ${other === "ar" ? "Arabic" : "English"} instead`}
        >
          {LANG_LABEL[other]}
        </button>
      </div>
      <p className="text-sm text-ink-soft">
        {pending ? "Saving…" : props.sentLabel ? <span className="text-open">✓ {props.sentLabel}</span> : "Not sent yet"}
      </p>
      <details className="w-full max-w-sm text-sm sm:text-right">
        <summary className="cursor-pointer text-ink-soft hover:text-ink">Preview message</summary>
        <p dir="auto" className="mt-2 whitespace-pre-line rounded-xl bg-enamel p-3 text-left text-ink">
          {props.messages[lang]}
        </p>
      </details>
    </div>
  );
}

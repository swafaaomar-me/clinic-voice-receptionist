"use client";

import { useState, useTransition } from "react";
import { cancelAppointment } from "./actions";

/** Two-step cancel: the first click asks for confirmation. */
export function CancelButton({ id, label }: { id: number; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (pending) return <span className="text-sm text-ink-soft">Cancelling…</span>;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-blush hover:text-gum-dark"
        aria-label={`Cancel ${label}`}
      >
        Cancel
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => startTransition(() => cancelAppointment(id))}
        className="rounded-full bg-gum px-3 py-1.5 text-sm font-medium text-white hover:bg-gum-dark"
      >
        Yes, cancel it
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
      >
        Keep
      </button>
    </span>
  );
}

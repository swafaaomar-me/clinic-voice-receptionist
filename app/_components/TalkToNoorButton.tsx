"use client";

import type { ReactNode } from "react";

/** Event the chat widget listens for. `detail` can carry a first message to send. */
export const OPEN_NOOR_EVENT = "noor:open";

export function openNoorChat(message?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_NOOR_EVENT, { detail: message }));
}

export function TalkToNoorButton({
  className,
  children = "Talk to Noor",
  message,
}: {
  className?: string;
  children?: ReactNode;
  message?: string;
}) {
  return (
    <button type="button" className={className} onClick={() => openNoorChat(message)}>
      {children}
    </button>
  );
}

"use client";

import { useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { to12Hour } from "@/lib/opening-hours";
import { OPEN_NOOR_EVENT } from "./TalkToNoorButton";
import { languageOf, useVoice, type VoiceLang, type VoiceProblem } from "./useVoice";

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

/** True when the server turned the message away on purpose (flooding or a too-long message). */
function isRefusal(error: Error): boolean {
  const status = (error as { statusCode?: number }).statusCode;
  return status === 413 || status === 429;
}

const VOICE_PROBLEMS: Record<VoiceProblem, string> = {
  unsupported: "Talking isn't supported in this browser. Try Chrome or Edge, or type your message.",
  blocked: "The microphone is blocked. Allow it from the icon in the address bar, or type instead.",
  "no-microphone": "No microphone was found. You can type instead.",
  "no-speech": "I didn't hear anything. Tap the microphone and speak when it turns red.",
  offline: "Voice isn't available in this browser right now. Try Google Chrome or Microsoft Edge, or type instead.",
  failed: "Voice didn't work just now. Please try again, or type instead.",
};

const LANGUAGE_NAMES: Record<VoiceLang, string> = {
  en: "English",
  ar: "Arabic",
};

/** Holding the mic at least this long means push-to-talk; a shorter press is a tap. */
const HOLD_MS = 450;

/** The text Noor wrote in a message (without tool cards). */
function textOf(message: UIMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

function MicIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="m17 9 5 6m0-6-5 6" />}
    </svg>
  );
}

/**
 * A small label that appears when an icon button is hovered or focused.
 * Screen readers already get the button's aria-label, so the label itself is hidden from them.
 */
function Hint({
  text,
  place,
  children,
}: {
  text: string;
  place: "below-end" | "above-start" | "above-center";
  children: React.ReactNode;
}) {
  const position = {
    "below-end": "top-full right-0 mt-2",
    "above-start": "bottom-full left-0 mb-2",
    "above-center": "bottom-full left-1/2 mb-2 -translate-x-1/2",
  }[place];
  return (
    <span className="group/hint relative inline-flex shrink-0">
      {children}
      <span
        aria-hidden
        className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity delay-150 duration-150 group-hover/hint:opacity-100 group-has-[:focus-visible]/hint:opacity-100 motion-reduce:transition-none ${position}`}
      >
        {text}
      </span>
    </span>
  );
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
  // Spoken replies: on once the patient has used the microphone (or switches them on)
  const [speakReplies, setSpeakReplies] = useState(false);
  const [noVoiceFor, setNoVoiceFor] = useState<VoiceLang | null>(null);
  const speakRepliesRef = useRef(false);
  const speakRef = useRef<(text: string, lang: VoiceLang, onNoVoice?: (lang: VoiceLang) => void) => boolean>(() => false);
  const changeSpeakReplies = useCallback((on: boolean) => {
    speakRepliesRef.current = on;
    setSpeakReplies(on);
  }, []);

  // Conversation mode: after Noor answers out loud, the microphone opens again by itself
  const [conversation, setConversation] = useState(false);
  const conversationRef = useRef(false);
  const changeConversation = useCallback((on: boolean) => {
    conversationRef.current = on;
    setConversation(on);
  }, []);
  const listenAgainRef = useRef<() => void>(() => {});

  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    id: chatId,
    // Read Noor's reply aloud once it has fully arrived
    onFinish: ({ message, isAbort, isError }) => {
      if (isError) changeConversation(false);
      if (isAbort || isError || !speakRepliesRef.current) return;
      const listenAgainIfTalking = () => {
        if (conversationRef.current) listenAgainRef.current();
      };
      const text = textOf(message);
      if (!text) return listenAgainIfTalking();
      const lang = languageOf(text);
      const noVoice = (l: VoiceLang) => {
        setNoVoiceFor(l);
        listenAgainIfTalking();
      };
      if (!speakRef.current(text, lang, noVoice)) noVoice(lang);
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const sendText = useCallback(
    (text: string, viaVoice = false) => {
      if (!text.trim()) return;
      if (viaVoice) changeSpeakReplies(true);
      // Tell the server when replies will be heard, so Noor keeps them short and easy to listen to
      sendMessage({ text }, { body: { voice: viaVoice || speakReplies } });
    },
    [sendMessage, speakReplies, changeSpeakReplies],
  );
  const voice = useVoice(
    useMemo(
      () => ({
        onTranscript: (transcript: string) => sendText(transcript, true),
        // Silence in conversation mode means the patient has stepped away: stop listening for now
        onListeningEnd: (heardNothing: boolean) => {
          if (heardNothing && conversationRef.current) changeConversation(false);
        },
        onSpeechDone: () => {
          if (conversationRef.current) listenAgainRef.current();
        },
      }),
      [sendText, changeConversation],
    ),
  );
  useEffect(() => {
    speakRef.current = voice.speak;
  }, [voice.speak]);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      window.speechSynthesis?.cancel();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    changeConversation(false); // typing means they've switched to text
    voice.stopSpeaking();
    sendText(text);
    setInput("");
  }

  const last = messages[messages.length - 1];

  // The microphone listens in the language of the latest message, unless the patient switched it
  const lastText = last ? textOf(last) : "";
  const [langChoice, setLangChoice] = useState<{
    lang: VoiceLang;
    afterText: string;
  } | null>(null);
  const voiceLang: VoiceLang =
    langChoice && langChoice.afterText === lastText ? langChoice.lang : lastText ? languageOf(lastText) : "en";
  const setVoiceLang = (lang: VoiceLang) => setLangChoice({ lang, afterText: lastText });

  function startNewChat() {
    stop();
    changeConversation(false);
    voice.reset();
    setNoVoiceFor(null);
    setChatId(crypto.randomUUID());
  }

  function close() {
    changeConversation(false);
    voice.reset();
    setOpen(false);
  }

  // Lets the "listen again" callback use the current language
  const { startListening } = voice;
  useEffect(() => {
    listenAgainRef.current = () => startListening(voiceLang);
  }, [startListening, voiceLang]);

  // One microphone button, two ways to use it:
  //  - tap: conversation mode (talk, Noor answers out loud, the mic opens again by itself)
  //  - hold: push-to-talk (speak while holding, release to send)
  const pressRef = useRef<{ start: number; startedListening: boolean } | null>(null);

  function micDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (voice.listening) {
      pressRef.current = { start: Date.now(), startedListening: false };
      return;
    }
    voice.startListening(voiceLang, { hold: true });
    pressRef.current = { start: Date.now(), startedListening: true };
  }

  function micUp() {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press) return;
    if (!press.startedListening) {
      // Tapped while listening: send what was said and leave conversation mode
      changeConversation(false);
      voice.stopListening();
      return;
    }
    if (Date.now() - press.start >= HOLD_MS) {
      voice.releaseHold(false); // push-to-talk: send now
    } else {
      changeConversation(true);
      voice.releaseHold(true); // tap: keep listening and send when they pause
    }
  }

  /** Keyboard users (Enter/Space on the button) get conversation mode. */
  function micKey(e: React.MouseEvent<HTMLButtonElement>) {
    if (e.detail !== 0) return; // a real click is handled by the pointer events
    if (voice.listening) {
      changeConversation(false);
      voice.stopListening();
    } else {
      changeConversation(true);
      voice.startListening(voiceLang);
    }
  }

  function endConversation() {
    changeConversation(false);
    voice.reset();
  }
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
      // Any first tap or key press in the chat unlocks sound (needed for iPhones)
      onPointerDownCapture={voice.unlockAudio}
      onKeyDownCapture={voice.unlockAudio}
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
        {voice.canSpeak && (
          <Hint text={speakReplies ? "Mute Noor's voice" : "Hear Noor's replies"} place="below-end">
            <button
              type="button"
              onClick={() => {
                if (speakReplies) voice.stopSpeaking();
                changeSpeakReplies(!speakReplies);
              }}
              aria-pressed={speakReplies}
              aria-label={speakReplies ? "Spoken replies on. Turn off" : "Spoken replies off. Turn on"}
              className={`grid size-9 place-items-center rounded-full hover:bg-enamel ${speakReplies ? "text-gum" : "text-ink-soft"}`}
            >
              <SpeakerIcon on={speakReplies} />
            </button>
          </Hint>
        )}
        {messages.length > 0 && (
          <button
            type="button"
            onClick={startNewChat}
            className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-enamel hover:text-ink"
          >
            New chat
          </button>
        )}
        <Hint text="Close chat" place="below-end">
          <button
            type="button"
            onClick={close}
            aria-label="Close chat"
            className="grid size-9 place-items-center rounded-full text-xl text-ink-soft hover:bg-enamel hover:text-ink"
          >
            ×
          </button>
        </Hint>
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
          <div
            className="flex gap-1 self-start rounded-2xl rounded-bl-md bg-blush px-4 py-3.5"
            aria-label="Noor is typing"
          >
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
            {isRefusal(error) ? (
              // The server refused on purpose (too many or too long messages); its message says why
              <p>{error.message}</p>
            ) : (
              <>
                <p>Noor couldn&apos;t reply just now. This usually clears up in a moment.</p>
                <button
                  type="button"
                  onClick={() => regenerate()}
                  className="mt-2 font-medium text-gum hover:underline"
                >
                  Try again
                </button>
              </>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(voice.problem || noVoiceFor || voice.speaking || voice.preparing || conversation) && (
        <div className="flex items-start gap-3 border-t border-line bg-enamel px-4 py-2.5 text-sm" role="status">
          <p className="flex-1">
            {voice.problem
              ? VOICE_PROBLEMS[voice.problem]
              : noVoiceFor
                ? `This device has no ${LANGUAGE_NAMES[noVoiceFor]} voice installed, so Noor's ${LANGUAGE_NAMES[noVoiceFor]} replies are shown as text only.`
                : voice.listening
                  ? "I'm listening. Pause when you've finished."
                  : voice.preparing
                    ? "Noor is about to speak…"
                    : voice.speaking
                      ? conversation
                        ? "Noor is speaking. Tap the mic to interrupt."
                        : "Noor is speaking…"
                      : "Conversation mode is on."}
          </p>
          {voice.problem || noVoiceFor ? (
            <button
              type="button"
              onClick={() => {
                voice.clearProblem();
                setNoVoiceFor(null);
              }}
              className="font-medium text-gum hover:underline"
            >
              OK
            </button>
          ) : conversation ? (
            <button type="button" onClick={endConversation} className="font-medium text-gum hover:underline">
              End
            </button>
          ) : (
            <button type="button" onClick={() => voice.stopSpeaking()} className="font-medium text-gum hover:underline">
              Stop
            </button>
          )}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="noor-message" className="sr-only">
          Message Noor
        </label>
        <Hint
          text={
            voiceLang === "en" ? "Switch to Arabic" : "Switch to English"
          }
          place="above-start"
        >
          <button
            type="button"
            onClick={() => setVoiceLang(voiceLang === "en" ? "ar" : "en")}
            disabled={voice.listening}
            aria-label={`Speaking language: ${LANGUAGE_NAMES[voiceLang]}. Switch to ${LANGUAGE_NAMES[voiceLang === "en" ? "ar" : "en"]}`}
            className="grid h-10 min-w-10 shrink-0 place-items-center rounded-full border border-line px-2 text-sm font-semibold text-ink-soft hover:border-ink/40 hover:text-ink disabled:opacity-40"
          >
            {voiceLang === "en" ? "EN" : "ع"}
          </button>
        </Hint>
        <input
          id="noor-message"
          ref={inputRef}
          value={voice.listening ? voice.interim : input}
          readOnly={voice.listening}
          dir="auto"
          autoComplete="off"
          maxLength={1000}
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder={voice.listening ? `Listening in ${LANGUAGE_NAMES[voiceLang]}…` : "Type or talk…"}
          className="min-w-0 flex-1 rounded-full border border-line bg-enamel px-4 py-2.5 text-[15px] outline-none focus:border-ink/40"
        />
        <Hint text={voice.listening ? "Tap to send" : "Tap to chat · hold to talk"} place="above-center">
          <button
            type="button"
            onPointerDown={micDown}
            onPointerUp={micUp}
            onPointerCancel={micUp}
            onClick={micKey}
            onContextMenu={(e) => e.preventDefault()}
            disabled={busy && !voice.listening && !conversation}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? "Stop listening and send" : `Talk to Noor in ${LANGUAGE_NAMES[voiceLang]}`}
            className={`grid size-10 shrink-0 touch-none select-none place-items-center rounded-full disabled:opacity-40 ${
              voice.listening
                ? "animate-pulse bg-gum text-white motion-reduce:animate-none"
                : conversation
                  ? "border-2 border-gum text-gum"
                  : "border border-line text-ink hover:border-gum/40 hover:text-gum"
            }`}
          >
            <MicIcon />
          </button>
        </Hint>
        <button
          type="submit"
          disabled={busy || voice.listening || !input.trim()}
          className="h-10 rounded-full bg-gum px-4 text-[15px] font-medium text-white hover:bg-gum-dark disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}

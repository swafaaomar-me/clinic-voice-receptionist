"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Talking to Noor with the browser's built-in speech features (free, no extra service):
//  - SpeechRecognition turns the patient's voice into text (Chrome, Edge, Safari).
//  - speechSynthesis reads Noor's replies aloud with a voice installed on the device.

export type VoiceLang = "en" | "ar";

const LOCALES: Record<VoiceLang, string> = { en: "en-US", ar: "ar-SA" };

export type VoiceProblem = "unsupported" | "blocked" | "no-microphone" | "no-speech" | "offline" | "failed";

// The Web Speech recognition API isn't in TypeScript's built-in types yet, so we describe the parts we use
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** "ar" when most letters in the text are Arabic. */
export function languageOf(text: string): VoiceLang {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin ? "ar" : "en";
}

/** Makes a written reply sound right when read aloud. */
export function textForSpeech(text: string, lang: VoiceLang): string {
  return (
    text
      // Markdown symbols and emoji would be read out or cause odd pauses
      .replace(/[*_#`>|~]/g, "")
      .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "")
      // Read phone numbers digit by digit, not as "five hundred fifty-one million…"
      .replace(/\b0\d{8,9}\b|[٠-٩]{9,10}/g, (n) => n.split("").join(" "))
      .replace(/\bSAR\b/g, lang === "ar" ? "ريال" : "riyals")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Splits text into sentences: Chrome cuts off long speech, so we queue short pieces. */
export function sentences(text: string): string[] {
  // Break after . ! ? or ؟ followed by a space or line break (so "4.5" and "10:00" stay whole)
  const pieces = text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Don't break after titles like "Dr." — join them to what follows
  const joined: string[] = [];
  for (const piece of pieces) {
    const previous = joined[joined.length - 1];
    if (previous && /(\b(Dr|Mr|Mrs|Ms|St|No)\.|\bد\.)$/i.test(previous)) joined[joined.length - 1] = `${previous} ${piece}`;
    else joined.push(piece);
  }
  return joined;
}

// Noor is a woman, so female voices come first. Browsers don't say a voice's gender,
// so we go by the names of common female voices (Windows, Edge, Chrome, macOS/iOS).
const FEMALE_VOICES =
  /female|zariyah|fatima|laila|amany|salma|hoda|mouna|amina|noura|sana|zira|aria|jenny|ava|emma|michelle|samantha|karen|moira|tessa|serena|susan|hazel|libby|sonia|natasha|google us english/i;
const MALE_VOICES = /\bmale\b|naayf|hamed|shakir|majed|maged|tarik|hamdan|david|mark|guy|ryan|daniel|alex|fred|george/i;
// Gulf Arabic accents sound closest to a Riyadh receptionist
const GULF_ARABIC = /^ar-(SA|AE|BH|KW|QA|OM)$/i;

export function pickVoice(voices: SpeechSynthesisVoice[], lang: VoiceLang): SpeechSynthesisVoice | null {
  const matching = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(lang));
  if (matching.length === 0) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const locale = v.lang.replace("_", "-");
    return (
      (FEMALE_VOICES.test(v.name) && !/\bmale\b/i.test(v.name) ? 6 : 0) +
      (MALE_VOICES.test(v.name) ? -2 : 0) +
      (lang === "ar" && GULF_ARABIC.test(locale) ? 3 : 0) +
      (locale === LOCALES[lang] ? 1 : 0) + // Saudi Arabic / US English
      (/natural|online|neural|google/i.test(v.name) ? 2 : 0) // the better-sounding voices
    );
  };
  return [...matching].sort((a, b) => score(b) - score(a))[0];
}

/** A fraction of a second of silence, used to unlock sound on iPhones. */
let silentUrl: string | null = null;
function silentWavUrl(): string {
  if (silentUrl) return silentUrl;
  const samples = 800; // 0.1 s at 8 kHz
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  silentUrl = URL.createObjectURL(new Blob([view.buffer], { type: "audio/wav" }));
  return silentUrl;
}

/** Plays the silent sound on a player, clearing any handlers from an earlier reply. */
function playSilence(player: HTMLAudioElement): Promise<void> {
  player.onplay = null;
  player.onended = null;
  player.src = silentWavUrl();
  return player.play();
}

// Browser support and the list of installed voices, read in a way React can subscribe to
const noop = () => () => {};
let installedVoices: SpeechSynthesisVoice[] = [];
function subscribeToVoices(onChange: () => void) {
  if (!("speechSynthesis" in window)) return () => {};
  const update = () => {
    installedVoices = window.speechSynthesis.getVoices();
    onChange();
  };
  update();
  window.speechSynthesis.addEventListener("voiceschanged", update); // voices load a moment after the page
  return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
}

/** How long the patient must be quiet before their words are sent. Thinking pauses are shorter than this. */
const SILENCE_MS: Record<VoiceLang, number> = { en: 1500, ar: 1700 };
/** Longer pause allowed while the patient is reading out a number, since people pause between digit groups. */
const NUMBER_SILENCE_MS = 3000;
const ENDS_WITH_NUMBER =
  /([0-9\u0660-\u0669]|\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)|(صفر|واحد|اثنين|اثنان|ثلاثة|ثلاث|أربعة|اربعة|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع))\s*[.,،]?$/i;
/** Stop listening if nothing at all is said for this long. */
const NOTHING_HEARD_MS = 8000;

interface VoiceCallbacks {
  /** The patient finished speaking; send their words. */
  onTranscript: (text: string) => void;
  /** Listening ended. heardNothing is true when the patient said nothing at all. */
  onListeningEnd?: (heardNothing: boolean) => void;
  /** Noor finished reading a reply aloud (not called when she is interrupted). */
  onSpeechDone?: () => void;
}

export function useVoice(callbacks: VoiceCallbacks) {
  const canListen = useSyncExternalStore(noop, () => recognitionClass() !== null, () => false);
  const canSpeak = useSyncExternalStore(noop, () => "speechSynthesis" in window, () => false);
  const voices = useSyncExternalStore(subscribeToVoices, () => installedVoices, () => installedVoices);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false); // waiting for the AI voice to be generated
  const [problem, setProblem] = useState<VoiceProblem | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceRequestRef = useRef<AbortController | null>(null);

  const recognitionRef = useRef<Recognition | null>(null);
  const finalTextRef = useRef("");
  const lastInterimRef = useRef("");
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);
  const holdingRef = useRef(false); // push-to-talk: keep listening until the button is released
  const heardRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nothingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef<VoiceLang>("en");

  // Stop talking and listening if the chat disappears
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      voiceRequestRef.current?.abort();
      audioRef.current?.pause();
      recognitionRef.current?.abort();
    },
    [],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = null;
    const player = audioRef.current;
    if (player) {
      // Keep the same player (iPhones only allow sound from one that was started by a tap); just silence it
      player.onplay = null;
      player.onended = null;
      player.pause();
    }
    setPreparing(false);
    setSpeaking(false);
  }, []);

  /**
   * iPhones (and some browsers) only allow a page to play sound that was started by a tap.
   * Noor's voice arrives a moment after the tap, so on the first touch we play a tiny silent
   * sound on the same player; after that, the browser lets it play her replies.
   */
  const unlockedRef = useRef(false);
  const unlockAudio = useCallback(() => {
    if (unlockedRef.current || typeof window === "undefined") return;
    const player = audioRef.current ?? new Audio();
    audioRef.current = player;
    playSilence(player)
      .then(() => {
        unlockedRef.current = true;
      })
      .catch(() => {});
    if ("speechSynthesis" in window) {
      const quiet = new SpeechSynthesisUtterance(" ");
      quiet.volume = 0;
      window.speechSynthesis.speak(quiet); // unlocks the browser voice too
    }
  }, []);

  const hasVoiceFor = useCallback((lang: VoiceLang) => pickVoice(voices, lang) !== null, [voices]);

  /** Reads text aloud with a voice installed on the device. Returns false if there is none for that language. */
  const speakWithBrowser = useCallback(
    (text: string, lang: VoiceLang): boolean => {
      if (!canSpeak) return false;
      const voice = pickVoice(voices, lang);
      if (!voice) return false;
      const synth = window.speechSynthesis;
      synth.cancel();
      const pieces = sentences(textForSpeech(text, lang));
      if (pieces.length === 0) return true;
      pieces.forEach((piece, i) => {
        const utterance = new SpeechSynthesisUtterance(piece);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = lang === "ar" ? 0.95 : 1;
        if (i === 0) utterance.onstart = () => setSpeaking(true);
        if (i === pieces.length - 1)
          utterance.onend = () => {
            setSpeaking(false);
            callbacksRef.current.onSpeechDone?.();
          };
        utterance.onerror = () => setSpeaking(false);
        synth.speak(utterance);
      });
      return true;
    },
    [canSpeak, voices],
  );

  /**
   * Reads one of Noor's replies aloud with Gemini's natural voice, falling back to the browser's own voice
   * if Gemini is busy or out of free quota.
   * Returns false, or calls onNoVoice later, when there is no way to speak that language on this device.
   */
  const speak = useCallback(
    (text: string, lang: VoiceLang = languageOf(text), onNoVoice?: (lang: VoiceLang) => void): boolean => {
      stopSpeaking();

      const request = new AbortController();
      voiceRequestRef.current = request;
      setPreparing(true);
      const fallBack = () => {
        if (request.signal.aborted) return; // the patient interrupted, so stay quiet
        setPreparing(false);
        if (!speakWithBrowser(text, lang)) onNoVoice?.(lang);
      };

      fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textForSpeech(text, lang), lang }),
        signal: request.signal,
      })
        .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
        .then((blob) => {
          if (request.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          const audio = audioRef.current ?? new Audio();
          audioRef.current = audio;
          audio.src = url;
          audio.onplay = () => {
            setPreparing(false);
            setSpeaking(true);
          };
          audio.onended = () => {
            setSpeaking(false);
            URL.revokeObjectURL(url);
            callbacksRef.current.onSpeechDone?.();
          };
          return audio.play();
        })
        .catch(fallBack);
      return true;
    },
    [speakWithBrowser, stopSpeaking],
  );

  const clearTimers = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (nothingTimerRef.current) clearTimeout(nothingTimerRef.current);
    silenceTimerRef.current = null;
    nothingTimerRef.current = null;
  };

  /** Ends listening; whatever was heard is sent. */
  const stopListening = useCallback(() => {
    clearTimers();
    holdingRef.current = false;
    recognitionRef.current?.stop(); // ends after processing what was already heard
  }, []);

  /** Waits for a real pause before sending, so thinking pauses don't cut the patient off. */
  const restartSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (holdingRef.current) return; // push-to-talk sends on release instead
    const midNumber = ENDS_WITH_NUMBER.test(lastInterimRef.current.trim());
    silenceTimerRef.current = setTimeout(
      () => recognitionRef.current?.stop(),
      midNumber ? NUMBER_SILENCE_MS : SILENCE_MS[langRef.current],
    );
  }, []);

  /**
   * Starts listening. With hold=true it keeps listening until releaseHold() (push-to-talk);
   * otherwise it sends automatically once the patient pauses.
   */
  const startListening = useCallback(
    (lang: VoiceLang, options: { hold?: boolean; automatic?: boolean } = {}) => {
      const RecognitionClass = recognitionClass();
      if (!RecognitionClass) {
        setProblem("unsupported");
        return;
      }
      stopSpeaking(); // talking over Noor interrupts her
      const previous = recognitionRef.current;
      recognitionRef.current = null; // so the old session ends without sending anything
      previous?.abort();
      clearTimers();

      const recognition = new RecognitionClass();
      recognition.lang = LOCALES[lang];
      recognition.interimResults = true; // show words as they are recognised
      recognition.continuous = true; // keep going through short pauses; our own timer decides when they're done
      recognition.maxAlternatives = 1;
      finalTextRef.current = "";
      heardRef.current = false;
      holdingRef.current = Boolean(options.hold);
      // When the mic reopened by itself (conversation mode), silence just means the patient is done: no error message
      const quietIfSilent = Boolean(options.automatic);
      langRef.current = lang;

      recognition.onresult = (event) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalTextRef.current += result[0].transcript + " ";
          else interimText += result[0].transcript;
        }
        const heard = (finalTextRef.current + interimText).trim();
        setInterim(heard);
        lastInterimRef.current = heard;
        if (heard) {
          heardRef.current = true;
          if (nothingTimerRef.current) clearTimeout(nothingTimerRef.current);
          restartSilenceTimer();
        }
      };
      recognition.onerror = (event) => {
        const problems: Record<string, VoiceProblem> = {
          "not-allowed": "blocked",
          "service-not-allowed": "blocked",
          "audio-capture": "no-microphone",
          "no-speech": "no-speech",
          network: "offline",
        };
        if (event.error === "aborted" || (event.error === "no-speech" && quietIfSilent)) return;
        setProblem(problems[event.error] ?? "failed");
      };
      recognition.onend = () => {
        clearTimers();
        holdingRef.current = false;
        setListening(false);
        setInterim("");
        if (recognitionRef.current !== recognition) return; // replaced by a newer session
        recognitionRef.current = null;
        const text = finalTextRef.current.trim() || (heardRef.current ? lastInterimRef.current : "");
        lastInterimRef.current = "";
        if (text) callbacksRef.current.onTranscript(text);
        callbacksRef.current.onListeningEnd?.(!text);
      };

      recognitionRef.current = recognition;
      setProblem(null);
      setInterim("");
      setListening(true);
      // Nothing said at all? Stop instead of listening forever.
      nothingTimerRef.current = setTimeout(() => {
        if (!heardRef.current && !holdingRef.current) {
          if (!quietIfSilent) setProblem("no-speech");
          recognition.stop();
        }
      }, NOTHING_HEARD_MS);
      try {
        recognition.start();
      } catch {
        clearTimers();
        setListening(false);
        setProblem("failed");
      }
    },
    [stopSpeaking, restartSilenceTimer],
  );

  /** Push-to-talk released: send now. Or, with keepListening, switch to "send when they pause". */
  const releaseHold = useCallback(
    (keepListening: boolean) => {
      holdingRef.current = false;
      if (!keepListening) stopListening();
      else if (heardRef.current) restartSilenceTimer();
    },
    [stopListening, restartSilenceTimer],
  );

  /** Stops everything, e.g. when the chat is closed. */
  const reset = useCallback(() => {
    clearTimers();
    holdingRef.current = false;
    const current = recognitionRef.current;
    recognitionRef.current = null; // abandon without sending
    current?.abort();
    stopSpeaking();
    setListening(false);
    setInterim("");
    setProblem(null);
  }, [stopSpeaking]);

  return {
    canListen,
    canSpeak,
    hasVoiceFor,
    listening,
    interim,
    speaking,
    preparing,
    problem,
    clearProblem: () => setProblem(null),
    startListening,
    stopListening,
    releaseHold,
    speak,
    stopSpeaking,
    unlockAudio,
    reset,
  };
}

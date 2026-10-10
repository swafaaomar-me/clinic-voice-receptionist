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
  const pieces = text.match(/[^.!?؟\n]+[.!?؟]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  // Don't break after titles like "Dr." or numbers like "10." — join them to what follows
  const joined: string[] = [];
  for (const piece of pieces) {
    const previous = joined[joined.length - 1];
    if (previous && /(\b(Dr|Mr|Mrs|Ms|St|No)\.|\bد\.|\d\.)$/i.test(previous)) joined[joined.length - 1] = `${previous} ${piece}`;
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

export function useVoice(onFinalTranscript: (text: string) => void) {
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
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

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
    audioRef.current?.pause();
    audioRef.current = null;
    setPreparing(false);
    setSpeaking(false);
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
        if (i === pieces.length - 1) utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        synth.speak(utterance);
      });
      return true;
    },
    [canSpeak, voices],
  );

  /**
   * Reads one of Noor's replies aloud.
   * Arabic uses Gemini's natural voice (browser voices can't do a Saudi accent), with the browser voice as a backup.
   * Returns false, or calls onNoVoice later, when there is no way to speak that language on this device.
   */
  const speak = useCallback(
    (text: string, lang: VoiceLang = languageOf(text), onNoVoice?: (lang: VoiceLang) => void): boolean => {
      stopSpeaking();
      if (lang !== "ar") return speakWithBrowser(text, lang);

      const request = new AbortController();
      voiceRequestRef.current = request;
      setPreparing(true);
      const fallBack = () => {
        if (request.signal.aborted) return; // the patient interrupted, so stay quiet
        setPreparing(false);
        if (!speakWithBrowser(text, "ar")) onNoVoice?.("ar");
      };

      fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textForSpeech(text, "ar") }),
        signal: request.signal,
      })
        .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
        .then((blob) => {
          if (request.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onplay = () => {
            setPreparing(false);
            setSpeaking(true);
          };
          audio.onended = () => {
            setSpeaking(false);
            URL.revokeObjectURL(url);
          };
          return audio.play();
        })
        .catch(fallBack);
      return true;
    },
    [speakWithBrowser, stopSpeaking],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop(); // ends after processing what was already heard
  }, []);

  /** Starts listening. Speech ends automatically when the patient pauses, then the text is sent. */
  const startListening = useCallback(
    (lang: VoiceLang) => {
      const RecognitionClass = recognitionClass();
      if (!RecognitionClass) {
        setProblem("unsupported");
        return;
      }
      stopSpeaking(); // talking over Noor interrupts her
      recognitionRef.current?.abort();

      const recognition = new RecognitionClass();
      recognition.lang = LOCALES[lang];
      recognition.interimResults = true; // show words as they are recognised
      recognition.continuous = false; // stop at the first pause
      recognition.maxAlternatives = 1;
      finalTextRef.current = "";

      recognition.onresult = (event) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalTextRef.current += result[0].transcript;
          else interimText += result[0].transcript;
        }
        setInterim((finalTextRef.current + interimText).trim());
      };
      recognition.onerror = (event) => {
        const problems: Record<string, VoiceProblem> = {
          "not-allowed": "blocked",
          "service-not-allowed": "blocked",
          "audio-capture": "no-microphone",
          "no-speech": "no-speech",
          network: "offline",
        };
        if (event.error !== "aborted") setProblem(problems[event.error] ?? "failed");
      };
      recognition.onend = () => {
        setListening(false);
        setInterim("");
        recognitionRef.current = null;
        const text = finalTextRef.current.trim();
        if (text) onFinalRef.current(text);
      };

      recognitionRef.current = recognition;
      setProblem(null);
      setInterim("");
      setListening(true);
      try {
        recognition.start();
      } catch {
        setListening(false);
        setProblem("failed");
      }
    },
    [stopSpeaking],
  );

  /** Stops everything, e.g. when the chat is closed. */
  const reset = useCallback(() => {
    recognitionRef.current?.abort();
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
    speak,
    stopSpeaking,
    reset,
  };
}

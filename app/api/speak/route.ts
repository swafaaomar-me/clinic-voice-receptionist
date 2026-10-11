import { speakReply } from "@/lib/speech";
import { checkSpeakLimit, clientIp } from "@/lib/security";

// Gemini can take a few seconds to produce the audio
export const maxDuration = 30;

const MAX_CHARS = 600;

/**
 * Turns one of Noor's replies into speech with Gemini's voice.
 * The chat widget falls back to the browser's own voice whenever this doesn't return audio.
 */
export async function POST(req: Request) {
  let text: unknown;
  let lang: unknown;
  try {
    ({ text, lang } = await req.json());
  } catch {
    return new Response("Bad request.", { status: 400 });
  }
  // Only short replies in our two languages, so this can't be used as a free general-purpose voice service
  if (typeof text !== "string" || !text.trim() || text.length > MAX_CHARS || (lang !== "en" && lang !== "ar")) {
    return new Response("Bad request.", { status: 400 });
  }

  try {
    if (await checkSpeakLimit(clientIp(req.headers))) return new Response("Too many requests.", { status: 429 });
  } catch (error) {
    console.error("Speak limit check failed:", error);
  }

  const audio = await speakReply(text.trim(), lang);
  if (!audio) return new Response("Voice unavailable.", { status: 503 });

  return new Response(new Uint8Array(audio), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
  });
}

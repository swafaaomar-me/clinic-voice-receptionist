// Turns Noor's Arabic replies into natural speech with Gemini's text-to-speech model.
// Browser voices read Saudi dialect badly, so Arabic goes through Gemini; English keeps the browser voice.

// Newest first. GEMINI_TTS_MODEL in .env.local can override it.
const MODELS = [process.env.GEMINI_TTS_MODEL, "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"].filter(
  (m, i, all): m is string => Boolean(m) && all.indexOf(m) === i,
);
const VOICE = process.env.GEMINI_TTS_VOICE ?? "Aoede";

// Gemini voices follow plain-language directions for accent and tone
const ARABIC_STYLE =
  "Read this aloud as a warm, polite young Saudi woman working at the reception of a private dental clinic in Riyadh. " +
  "Natural Saudi (Riyadh) accent, friendly and professional, calm conversational pace. Read only the text, nothing else:";

/** Gemini returns raw 16-bit mono PCM at 24 kHz; a WAV header makes it playable in any browser. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per sample
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Speaks Arabic text with Gemini. Returns a WAV file, or null if no model could do it (busy, quota, no access). */
export async function speakArabic(text: string): Promise<Buffer | null> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;

  for (const model of MODELS) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${ARABIC_STYLE}\n${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        console.warn(`Gemini voice (${model}) replied ${response.status}`);
        continue;
      }
      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
      };
      const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!part?.data) continue;
      const rate = Number(part.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
      return pcmToWav(Buffer.from(part.data, "base64"), rate);
    } catch (error) {
      console.warn(`Gemini voice (${model}) failed:`, error);
    }
  }
  return null;
}

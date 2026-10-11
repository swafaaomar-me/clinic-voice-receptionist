import { describe, expect, it } from "vitest";
import { languageOf, pickVoice, sentences, textForSpeech } from "@/app/_components/useVoice";

const voice = (name: string, lang: string) => ({ name, lang, localService: true }) as SpeechSynthesisVoice;

describe("preparing replies to be spoken", () => {
  it("detects the reply's language", () => {
    expect(languageOf("أبشري، حجزت لك الموعد")).toBe("ar");
    expect(languageOf("Sure, see you Monday")).toBe("en");
  });

  it("reads phone numbers digit by digit and prices as riyals", () => {
    const spoken = textForSpeech("Cleaning is 250 SAR. Your number is 0538078783.", "en");
    expect(spoken).toContain("250 riyals");
    expect(spoken).toContain("0 5 3 8 0 7 8 7 8 3");
  });

  it("splits into sentences without breaking after Dr.", () => {
    expect(sentences("Sure! Dr. Sara is free at 10. Shall I book it?")).toEqual(["Sure!", "Dr. Sara is free at 10.", "Shall I book it?"]);
  });

  it("prefers a female voice, and a Saudi one for Arabic", () => {
    const voices = [
      voice("Microsoft Naayf - Arabic (Saudi)", "ar-SA"),
      voice("Microsoft Zariyah Online (Natural) - Arabic (Saudi Arabia)", "ar-SA"),
      voice("Microsoft David - English (United States)", "en-US"),
      voice("Microsoft Aria Online (Natural) - English (United States)", "en-US"),
    ];
    expect(pickVoice(voices, "ar")?.name).toContain("Zariyah");
    expect(pickVoice(voices, "en")?.name).toContain("Aria");
  });
});

describe("sentence splitting edge cases", () => {
  it("keeps decimals, times and Arabic question marks right", () => {
    expect(sentences("It takes 1.5 hours. Is 10:30 OK?")).toEqual(["It takes 1.5 hours.", "Is 10:30 OK?"]);
    expect(sentences("أبشري. يناسبك الساعة 10؟ تمام")).toEqual(["أبشري.", "يناسبك الساعة 10؟", "تمام"]);
  });
});

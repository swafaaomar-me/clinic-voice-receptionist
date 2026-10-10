/**
 * Normalises a Saudi mobile number to the local form "05XXXXXXXX".
 * Accepts spaces, dashes, +966 / 00966 prefixes and Arabic-Indic digits
 * (useful later when numbers come from speech). Returns null if it isn't valid.
 */
export function normalizeSaudiMobile(input: string): string | null {
  const westernDigits = input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  let digits = westernDigits.replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(5);
  else if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("5") && digits.length === 9) digits = `0${digits}`;
  return /^05\d{8}$/.test(digits) ? digits : null;
}

/**
 * Finds every valid Saudi mobile number written in some text, normalised to "05XXXXXXXX".
 * Used to check that a phone number really came from the patient, not from the AI.
 */
export function findSaudiMobiles(text: string): string[] {
  const westernDigits = spokenDigitsToNumbers(text).replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  // Digits may be separated by spaces or dashes ("055 123 4567", or "0 5 5 1…" from speech)
  const candidates = westernDigits.match(/\+?\d[\d\s-]{7,26}\d/g) ?? [];
  const found = new Set<string>();
  for (const candidate of candidates) {
    const phone = normalizeSaudiMobile(candidate);
    if (phone) found.add(phone);
  }
  return [...found];
}

// Number words that speech recognition sometimes writes out instead of digits
const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  صفر: "0", واحد: "1", اثنين: "2", اثنان: "2", ثنين: "2", ثلاثة: "3", ثلاث: "3", ثلاثه: "3", أربعة: "4", اربعة: "4", اربعه: "4",
  أربع: "4", اربع: "4", خمسة: "5", خمسه: "5", خمس: "5", ستة: "6", سته: "6", ست: "6", سبعة: "7", سبعه: "7", سبع: "7",
  ثمانية: "8", ثمانيه: "8", ثمان: "8", تسعة: "9", تسعه: "9", تسع: "9",
};

/**
 * Turns spoken-out digits into numbers: "zero five five one…" → "0 5 5 1…".
 * Only runs of 3+ digit words are converted, so ordinary sentences ("one cleaning") are left alone.
 */
export function spokenDigitsToNumbers(text: string): string {
  const word = "(?:" + Object.keys(DIGIT_WORDS).join("|") + ")";
  const run = new RegExp(`(?<![\\p{L}])${word}(?:[\\s,-]+(?:و)?${word}){2,}(?![\\p{L}])`, "giu");
  return text.replace(run, (match) =>
    match
      .split(/[\s,-]+/)
      .map((w) => DIGIT_WORDS[w.toLowerCase().replace(/^و(?=.)/, "")] ?? DIGIT_WORDS[w.toLowerCase()] ?? "")
      .join(" "),
  );
}

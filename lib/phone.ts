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
  const westernDigits = text.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const candidates = westernDigits.match(/\+?\d[\d\s-]{7,16}\d/g) ?? [];
  const found = new Set<string>();
  for (const candidate of candidates) {
    const phone = normalizeSaudiMobile(candidate);
    if (phone) found.add(phone);
  }
  return [...found];
}

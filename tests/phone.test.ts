import { describe, expect, it } from "vitest";
import { findSaudiMobiles, normalizeSaudiMobile, spokenDigitsToNumbers } from "@/lib/phone";

describe("normalizeSaudiMobile", () => {
  it.each([
    ["0551234567", "0551234567"],
    ["055 123 4567", "0551234567"],
    ["+966551234567", "0551234567"],
    ["00966551234567", "0551234567"],
    ["551234567", "0551234567"],
    ["٠٥٥١٢٣٤٥٦٧", "0551234567"], // Arabic-Indic digits
  ])("accepts %s", (input, expected) => {
    expect(normalizeSaudiMobile(input)).toBe(expected);
  });

  it.each(["0112345678", "05512345", "hello", "", "05512345678"])("rejects %s", (input) => {
    expect(normalizeSaudiMobile(input)).toBeNull();
  });
});

describe("findSaudiMobiles", () => {
  it("finds a number inside a sentence", () => {
    expect(findSaudiMobiles("my number is 055 123 4567 thanks")).toEqual(["0551234567"]);
  });

  it("understands numbers spoken as words, in English and Arabic", () => {
    expect(findSaudiMobiles("zero five five one two three four five six seven")).toEqual(["0551234567"]);
    expect(findSaudiMobiles("صفر خمسة خمسة واحد اثنين ثلاثة أربعة خمسة ستة سبعة")).toEqual(["0551234567"]);
  });

  it("finds nothing in an ordinary sentence", () => {
    expect(findSaudiMobiles("I want one cleaning at five")).toEqual([]);
  });
});

describe("spokenDigitsToNumbers", () => {
  it("leaves short runs of number words alone", () => {
    expect(spokenDigitsToNumbers("two cleanings")).toBe("two cleanings");
  });
});

import { describe, expect, it } from "vitest";
import { defaultLanguage, reminderMessage, whatsappLink } from "@/lib/reminders";

const appointment = {
  patientName: "Rana Ali",
  date: "2026-10-12",
  time: "13:00",
  dentist: "Dr. Sara Al-Harbi",
  dentistAr: "د. سارة الحربي",
  service: "Teeth cleaning",
  serviceAr: "تنظيف الأسنان",
};

describe("WhatsApp reminders", () => {
  it("writes the English reminder for tomorrow", () => {
    const text = reminderMessage(appointment, "en", "2026-10-11");
    expect(text).toContain("Hi Rana");
    expect(text).toContain("teeth cleaning appointment tomorrow, Monday October 12, at 1:00 PM with Dr. Sara Al-Harbi");
  });

  it("writes the Arabic reminder, keeping the phone number in the right order", () => {
    const text = reminderMessage({ ...appointment, patientName: "ريم" }, "ar", "2026-10-11");
    expect(text).toContain("مرحباً ريم");
    expect(text).toContain("بكرة");
    expect(text).toContain("⁦011 555 0123⁩"); // left-to-right isolate inside Arabic text
  });

  it("names the weekday when the appointment isn't tomorrow (after a Friday)", () => {
    expect(reminderMessage({ ...appointment, date: "2026-10-17" }, "en", "2026-10-15")).toContain("on Saturday, October 17");
  });

  it("chooses Arabic for Arabic names", () => {
    expect(defaultLanguage("ريم العتيبي")).toBe("ar");
    expect(defaultLanguage("Rana Ali")).toBe("en");
  });

  it("builds a wa.me link with the +966 number", () => {
    expect(whatsappLink("0538078783", "hi")).toBe("https://wa.me/966538078783?text=hi");
  });
});

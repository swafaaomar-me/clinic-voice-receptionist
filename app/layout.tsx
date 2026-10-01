import type { Metadata } from "next";
import { Readex_Pro } from "next/font/google";
import "./globals.css";

// One family designed for both Arabic and English
const readex = Readex_Pro({
  variable: "--font-readex",
  subsets: ["latin", "arabic"],
});

export const metadata: Metadata = {
  title: "Smile Dental Clinic | Riyadh",
  description:
    "Book a dentist in Al Olaya, Riyadh by talking to Noor, our AI receptionist, in English or Arabic.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${readex.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

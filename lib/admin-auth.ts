import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Staff sign in with one shared password (ADMIN_PASSWORD in .env.local).
// After signing in they get a cookie holding a token derived from that password,
// so changing the password signs everyone out.

const COOKIE_NAME = "smile_admin";
const SESSION_HOURS = 8;

function sameText(a: string, b: string): boolean {
  // Compare hashes in constant time so the check doesn't leak how much matched
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function sessionToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update("smile-admin-session-v1").digest("hex");
}

export function adminPasswordIsSet(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function passwordIsCorrect(input: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(password) && sameText(input, password!);
}

export async function isSignedIn(): Promise<boolean> {
  const token = sessionToken();
  if (!token) return false;
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  return Boolean(cookie) && sameText(cookie!, token);
}

export async function startSession() {
  const token = sessionToken();
  if (!token) throw new Error("ADMIN_PASSWORD is not set");
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true, // not readable by page scripts
    secure: process.env.NODE_ENV === "production", // HTTPS only once deployed
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE_NAME);
}

import { createHmac } from "node:crypto";
import { sendAlert } from "./alerts";
import { to12Hour } from "./opening-hours";
import { db } from "./supabase";
import { toRiyadh, weekdayName } from "./time";

// Security rules for the website: admin login lockout, chat flood limits,
// spotting attempts to trick Noor, and logging what her safety checks blocked.
// Everything is recorded in the security_events table for the staff dashboard,
// and the serious ones are also sent as instant alerts (see lib/alerts.ts).

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MINUTES = 15;
export const CHAT_LIMITS = [
  { key: "10m", windowSeconds: 10 * 60, max: 30, label: "30 messages in 10 minutes" },
  { key: "day", windowSeconds: 24 * 60 * 60, max: 200, label: "200 messages in a day" },
];
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_HISTORY_MESSAGES = 80;
export const MAX_BODY_BYTES = 200_000;
/** At most one instant alert per device and kind of event in this many minutes. */
const ALERT_COOLDOWN_MINUTES = 15;

export type SecurityKind =
  | "login_failed"
  | "login_locked"
  | "chat_rate_limited"
  | "oversized_request"
  | "prompt_injection"
  | "guard_blocked";

export const SECURITY_KINDS: Record<SecurityKind, { label: string; severity: "info" | "warning" | "high"; alert: boolean }> = {
  login_failed: { label: "Wrong admin password", severity: "info", alert: false },
  login_locked: { label: "Admin login locked", severity: "high", alert: true },
  chat_rate_limited: { label: "Chat flooding", severity: "warning", alert: true },
  oversized_request: { label: "Oversized request", severity: "warning", alert: true },
  prompt_injection: { label: "Tried to trick Noor", severity: "warning", alert: true },
  guard_blocked: { label: "Blocked by safety check", severity: "info", alert: false },
};

// ---------- Who is it? ----------

/** The visitor's IP address, as reported by the hosting platform. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** A short one-way code for an IP, so we can group events without storing the full address. */
export function deviceId(ip: string): string {
  const secret = process.env.SECURITY_SALT ?? process.env.ADMIN_PASSWORD ?? "smile-dental";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 10);
}

/** A masked IP for a rough idea of the source: 203.0.113.x, 2001:db8:… or "this computer". */
export function maskIp(ip: string): string {
  if (ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1") return "this computer";
  const v4 = ip.replace(/^::ffff:/, "").match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}:…`;
  return "unknown";
}

// ---------- Recording events and alerting ----------

function riyadhTimeNow(): string {
  const { date, time } = toRiyadh(new Date());
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${weekdayName(date).slice(0, 3)} ${day}, ${to12Hour(time)}`;
}

async function alertedRecently(device: string, kind: SecurityKind): Promise<boolean> {
  const since = new Date(Date.now() - ALERT_COOLDOWN_MINUTES * 60_000).toISOString();
  const { count, error } = await db()
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("device", device)
    .eq("kind", kind)
    .eq("notified", true)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Saves a security event and, for serious ones, sends an instant alert (at most one per device per 15 minutes). */
export async function recordSecurityEvent(event: {
  kind: SecurityKind;
  ip: string;
  details: string;
  chatId?: string | null;
}): Promise<{ notified: boolean }> {
  const info = SECURITY_KINDS[event.kind];
  const device = deviceId(event.ip);
  const ipHint = maskIp(event.ip);

  let notified = false;
  if (info.alert && !(await alertedRecently(device, event.kind))) {
    notified = await sendAlert(
      [
        `⚠️ Smile Dental security alert`,
        `${info.label}: ${event.details}`,
        `Device ${device} (${ipHint})`,
        `${riyadhTimeNow()}, Riyadh time`,
        `Details: staff dashboard → Security`,
      ].join("\n"),
    );
  }

  const { error } = await db()
    .from("security_events")
    .insert({
      kind: event.kind,
      severity: info.severity,
      device,
      ip_hint: ipHint,
      chat_id: event.chatId ?? null,
      details: event.details.slice(0, 500),
      notified,
    });
  if (error) throw new Error(`Could not save security event: ${error.message}`);
  return { notified };
}

// ---------- Admin login lockout ----------

/** Whether this device is locked out of admin sign-in, and for how many more minutes. */
export async function loginLockStatus(ip: string): Promise<{ locked: boolean; minutesLeft: number; triesLeft: number }> {
  const since = new Date(Date.now() - LOGIN_LOCK_MINUTES * 60_000).toISOString();
  const { data, error } = await db()
    .from("security_events")
    .select("created_at")
    .eq("device", deviceId(ip))
    .eq("kind", "login_failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(LOGIN_MAX_FAILURES);
  if (error) throw new Error(error.message);
  const failures = data ?? [];
  if (failures.length < LOGIN_MAX_FAILURES) {
    return { locked: false, minutesLeft: 0, triesLeft: LOGIN_MAX_FAILURES - failures.length };
  }
  // Locked until the oldest of the last 5 failures is more than 15 minutes old
  const unlocksAt = new Date(failures[LOGIN_MAX_FAILURES - 1].created_at).getTime() + LOGIN_LOCK_MINUTES * 60_000;
  return { locked: true, minutesLeft: Math.max(1, Math.ceil((unlocksAt - Date.now()) / 60_000)), triesLeft: 0 };
}

/** Records a wrong password. On the 5th within 15 minutes, locks the device and alerts the admin. */
export async function recordFailedLogin(ip: string): Promise<{ locked: boolean; triesLeft: number }> {
  await recordSecurityEvent({ kind: "login_failed", ip, details: "Someone entered a wrong staff password." });
  const status = await loginLockStatus(ip);
  if (status.locked) {
    await recordSecurityEvent({
      kind: "login_locked",
      ip,
      details: `${LOGIN_MAX_FAILURES} wrong staff passwords in ${LOGIN_LOCK_MINUTES} minutes. Sign-in is locked on that device for ${LOGIN_LOCK_MINUTES} minutes.`,
    });
  }
  return { locked: status.locked, triesLeft: status.triesLeft };
}

// ---------- Chat flood limits ----------

/**
 * Counts one chat message for this device. Returns the limit that was broken, if any.
 * The admin is alerted the first time a device goes over a limit.
 */
export async function checkChatLimit(ip: string, chatId: string | null): Promise<string | null> {
  const device = deviceId(ip);
  for (const limit of CHAT_LIMITS) {
    const { data, error } = await db().rpc("hit_rate_limit", {
      p_key: `chat:${limit.key}:${device}`,
      p_window_seconds: limit.windowSeconds,
    });
    if (error) throw new Error(error.message);
    const hits = Number(data);
    if (hits > limit.max) {
      if (hits === limit.max + 1) {
        await recordSecurityEvent({
          kind: "chat_rate_limited",
          ip,
          chatId,
          details: `A device sent more than ${limit.label}. Its messages are being refused for now.`,
        });
      }
      return limit.label;
    }
  }
  return null;
}

// ---------- Attempts to trick Noor ----------

const TRICK_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\b(ignore|forget|disregard|override)\b.{0,30}\b(instructions?|rules|prompts?|guidelines|programming)\b/i,
    label: "asked Noor to ignore her instructions",
  },
  {
    pattern: /\b(reveal|show|print|repeat|tell me|give me|what (is|are))\b.{0,25}\b(system prompt|your (hidden |secret |original )?(instructions|prompt))\b/i,
    label: "asked to see Noor's hidden instructions",
  },
  { pattern: /\bsystem prompt\b/i, label: "mentioned the system prompt" },
  { pattern: /\b(developer|dan|god|admin|debug) mode\b|\bjailbreak/i, label: "tried a jailbreak (special 'mode')" },
  { pattern: /\byou are (now|no longer)\b|\bpretend (to be|you are)\b/i, label: "tried to change who Noor is" },
  {
    pattern: /\b(bypass|skip|disable|turn off)\b.{0,25}\b(checks?|rules|security|verification|safety)\b/i,
    label: "asked Noor to skip her safety checks",
  },
  { pattern: /\b(drop|truncate|delete from|insert into)\b.{0,15}\b(table|appointments|dentists)\b|<script\b/i, label: "sent database or script code" },
  { pattern: /تجاهل.{0,25}(التعليمات|تعليماتك|الأوامر|القواعد)/, label: "asked Noor to ignore her instructions (Arabic)" },
  { pattern: /(تعليماتك|التعليمات المخفية|البرومبت|برومبت النظام)/, label: "asked about Noor's hidden instructions (Arabic)" },
];

/** If a patient message looks like an attempt to trick Noor, returns what it tried to do. */
export function detectTrickAttempt(text: string): string | null {
  for (const { pattern, label } of TRICK_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

// ---------- What Noor's safety checks blocked ----------

const GUARD_LABELS: Record<string, string> = {
  unknown_phone: "Noor tried to use a phone number the patient never typed. Blocked.",
  not_confirmed: "A booking was attempted before the patient confirmed the details. Blocked.",
  details_changed: "A booking was attempted with details different from what the patient confirmed. Blocked.",
  wrong_phone_for_booking: "Someone tried to cancel a booking with a phone number that doesn't match it. Blocked.",
};

/** Turns blocked tool results from one reply into security event descriptions. */
export function guardBlocks(toolOutputs: unknown[]): string[] {
  return toolOutputs.flatMap((output) => {
    const o = output as { ok?: boolean; guard?: string } | null;
    return o && o.ok === false && o.guard && GUARD_LABELS[o.guard] ? [GUARD_LABELS[o.guard]] : [];
  });
}

// ---------- Dashboard ----------

export interface SecurityEventRow {
  id: number;
  createdAt: string;
  kind: SecurityKind;
  severity: "info" | "warning" | "high";
  device: string;
  ipHint: string | null;
  details: string;
  notified: boolean;
}

export const SECURITY_FILTERS: Record<string, { label: string; kinds: SecurityKind[] }> = {
  alerts: { label: "Alerts", kinds: ["login_locked", "chat_rate_limited", "oversized_request", "prompt_injection"] },
  login: { label: "Sign-in", kinds: ["login_failed", "login_locked"] },
  chat: { label: "Chat flooding", kinds: ["chat_rate_limited", "oversized_request"] },
  tricks: { label: "Trick attempts", kinds: ["prompt_injection"] },
  blocked: { label: "Blocked by checks", kinds: ["guard_blocked"] },
};

export async function listSecurityEvents(options: { filter?: string; limit?: number } = {}): Promise<SecurityEventRow[]> {
  let query = db()
    .from("security_events")
    .select("id, created_at, kind, severity, device, ip_hint, details, notified")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);
  const filter = options.filter ? SECURITY_FILTERS[options.filter] : undefined;
  if (filter) query = query.in("kind", filter.kinds);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load security events: ${error.message}`);
  return (data ?? []).map((e) => ({
    id: e.id,
    createdAt: e.created_at,
    kind: e.kind,
    severity: e.severity,
    device: e.device,
    ipHint: e.ip_hint,
    details: e.details,
    notified: e.notified,
  }));
}

/** How many alert-worthy events happened in the last 24 hours (for the tab badge). */
export async function countRecentAlerts(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count, error } = await db()
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .in("kind", SECURITY_FILTERS.alerts.kinds)
    .gte("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

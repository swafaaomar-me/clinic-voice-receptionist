"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, isSignedIn, passwordIsCorrect, startSession } from "@/lib/admin-auth";
import { cancelAsStaff, markReminderSent } from "@/lib/admin-data";
import { clientIp, loginLockStatus, recordFailedLogin } from "@/lib/security";

export async function signIn(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const ip = clientIp(await headers());

  // A locked device can't sign in at all, even with the right password, until the lock ends.
  // If the security check itself fails (e.g. the database is unreachable), sign-in still works.
  let locked = false;
  try {
    locked = (await loginLockStatus(ip)).locked;
  } catch (error) {
    console.error("Login lock check failed:", error);
  }
  if (locked) redirect("/admin/login");

  if (!passwordIsCorrect(password)) {
    let triesLeft: number | null = null;
    try {
      const result = await recordFailedLogin(ip);
      triesLeft = result.locked ? 0 : result.triesLeft;
    } catch (error) {
      console.error("Could not record failed login:", error);
    }
    redirect(triesLeft === null ? "/admin/login?error=1" : `/admin/login?error=1&left=${triesLeft}`);
  }

  await startSession();
  redirect("/admin");
}

export async function signOut() {
  await endSession();
  redirect("/admin/login");
}

export async function cancelAppointment(id: number) {
  // Every action checks the session itself; hiding the button isn't enough
  if (!(await isSignedIn())) redirect("/admin/login");
  await cancelAsStaff(id);
  refresh();
}

export async function reminderSent(id: number) {
  if (!(await isSignedIn())) redirect("/admin/login");
  await markReminderSent(id);
  refresh();
}

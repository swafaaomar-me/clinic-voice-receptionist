"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, isSignedIn, passwordIsCorrect, startSession } from "@/lib/admin-auth";
import { cancelAsStaff } from "@/lib/admin-data";

export async function signIn(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!passwordIsCorrect(password)) redirect("/admin/login?error=1");
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

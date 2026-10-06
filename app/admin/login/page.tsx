import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminPasswordIsSet, isSignedIn } from "@/lib/admin-auth";
import { alertsAreSetUp } from "@/lib/alerts";
import { clientIp, loginLockStatus } from "@/lib/security";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Staff sign in | Smile Dental Clinic", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage(props: { searchParams: SearchParams }) {
  if (await isSignedIn()) redirect("/admin");
  const { error, left } = await props.searchParams;
  const configured = adminPasswordIsSet();
  const triesLeft = typeof left === "string" && /^\d$/.test(left) ? Number(left) : null;

  let lock = { locked: false, minutesLeft: 0 };
  try {
    lock = await loginLockStatus(clientIp(await headers()));
  } catch (lockError) {
    console.error("Login lock check failed:", lockError);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-soft">Smile Dental Clinic</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.01em]">Staff sign in</h1>

        {!configured ? (
          <p className="mt-6 rounded-xl border border-gum/30 bg-paper p-4 text-[15px]">
            Staff sign-in isn&apos;t set up yet. Add a line <code className="font-semibold">ADMIN_PASSWORD=...</code> to{" "}
            <code className="font-semibold">.env.local</code>, then restart the app.
          </p>
        ) : lock.locked ? (
          <div role="alert" className="mt-6 rounded-xl border border-gum/30 bg-paper p-4 text-[15px]">
            <p className="font-semibold">Sign-in is locked for now</p>
            <p className="mt-1 text-ink-soft">
              Too many wrong passwords from this device. Try again in {lock.minutesLeft}{" "}
              {lock.minutesLeft === 1 ? "minute" : "minutes"}.{alertsAreSetUp() ? " The clinic admin has been notified." : ""}
            </p>
          </div>
        ) : (
          <form action={signIn} className="mt-8 flex flex-col gap-3">
            <label htmlFor="password" className="font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              className="rounded-xl border border-line bg-paper px-4 py-3 outline-none focus:border-ink/40"
            />
            {error && (
              <p role="alert" className="text-sm text-gum-dark">
                That password isn&apos;t right.
                {triesLeft !== null && triesLeft > 0
                  ? ` ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left before sign-in is locked for 15 minutes.`
                  : " Try again."}
              </p>
            )}
            <button
              type="submit"
              className="mt-2 rounded-full bg-ink px-6 py-3 font-medium text-white hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Sign in
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

import Link from "next/link";
import { signOut } from "./actions";

const TABS = [
  { href: "/admin", label: "Appointments" },
  { href: "/admin/conversations", label: "Conversations" },
];

/** Header shared by every staff page, with tabs to switch between them. */
export function AdminHeader({ current }: { current: "/admin" | "/admin/conversations" }) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 pt-4 sm:px-8">
        <div className="leading-tight">
          <p className="font-semibold">Smile Dental Clinic</p>
          <p className="text-sm text-ink-soft">Staff dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden whitespace-nowrap rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink sm:inline-block"
          >
            View website
          </Link>
          <form action={signOut}>
            <button type="submit" className="whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm hover:border-ink/40">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <nav aria-label="Staff pages" className="mx-auto mt-3 flex max-w-5xl gap-6 px-5 sm:px-8">
        {TABS.map((tab) => {
          const active = tab.href === current;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`border-b-2 pb-3 text-[15px] ${
                active ? "border-gum font-semibold text-ink" : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

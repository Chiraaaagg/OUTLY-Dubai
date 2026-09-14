import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/ui/primitives";
import { demoUser } from "@/lib/data/bookings";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * Inquiry Mode: "My inquiries" leads; "My trips" stays for post-payment orders.
 * Referrals and credits are hidden from navigation (pivot §2.1 Account row —
 * loyalty is V2 and there is nothing to show a user who has only inquired).
 * The route files are retained, not deleted.
 */
const NAV = [
  { label: "Dashboard", href: "/account" },
  { label: "My inquiries", href: "/account/inquiries" },
  { label: "My trips", href: "/account/bookings" },
  { label: "Saved", href: "/account/saved" },
  { label: "Profile & preferences", href: "/account/profile" },
];

/**
 * Account shell.
 *
 * MOCK AUTH — there is no session in this build; `demoUser` stands in. The
 * integration boundary is deliberately narrow: swap `demoUser` for a session
 * read and add a redirect guard here, and every account page works unchanged.
 * See docs/integration-boundaries.md.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container-page py-6 pb-20">
      <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Account" }]} className="mb-3" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] sm:text-3xl">Hello, {demoUser.firstName}</h1>
          <p className="mt-1 text-sm text-ink-600">
            {demoUser.email} · member since {demoUser.memberSince}
          </p>
        </div>
        <Link
          href="/search"
          className="rounded-[var(--radius-control)] bg-sun-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_var(--color-sun-700)] hover:bg-sun-600"
        >
          Plan something new
        </Link>
      </div>

      <nav aria-label="Account" className="mb-6 border-b border-ink-200">
        <ul className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-bold text-ink-600 transition-colors hover:border-ink-300 hover:text-ink-900"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}

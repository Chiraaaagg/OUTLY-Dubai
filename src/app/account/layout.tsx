import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/ui/primitives";
import { AccountNav } from "./_components/account-nav";
import { SignOutButton } from "./_components/sign-out-button";
import { customerDisplayName, requireCustomer } from "./_lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * Account shell (customer-auth contract §4).
 *
 * Server Component. Resolves the customer session from the httpOnly cookie
 * and redirects to /login when there is none — pages under here can assume a
 * signed-in customer. The greeting is the real person: first name when they
 * have told us one, otherwise the masked phone they signed in with.
 *
 * Nav: Dashboard · My inquiries · My trips · Saved · Profile. Referrals and
 * credits are gone (loyalty is V2; a mock balance was a trust cost).
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const { customer } = await requireCustomer("/account");
  const name = customerDisplayName(customer);
  const since = new Date(customer.createdAt).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="container-page py-6 pb-20">
      <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Account" }]} className="mb-3" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] sm:text-3xl">Hello, {name}</h1>
          <p className="mt-1 text-sm text-ink-600">
            <span className="tnum">{customer.phoneMasked}</span>
            {customer.email ? ` · ${customer.email}` : ""} · with us since {since}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SignOutButton />
          <Link
            href="/search"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-sun-500 px-4 text-sm font-bold text-white shadow-[0_2px_0_var(--color-sun-700)] hover:bg-sun-600"
          >
            Plan something new
          </Link>
        </div>
      </div>

      <AccountNav />

      {children}
    </div>
  );
}

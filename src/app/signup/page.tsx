"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Gift, Ticket, Wallet } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { cn } from "@/lib/utils";

/**
 * SIGNUP
 *
 * Deliberately *not* on the path to a booking. Guest checkout is mandatory
 * (AC-CO-01), so this page exists for people who want the account for its own
 * sake — and it has to earn that by listing what the account actually does.
 *
 * A guest booking is automatically linked to an account created later with the
 * same phone or email (AC-ACC-02), which is why the phone field is the primary
 * one here too.
 */
const BENEFITS = [
  { icon: Ticket, label: "All your vouchers in one place, offline-ready" },
  { icon: Check, label: "Cancel or change dates yourself, with the refund shown up front" },
  { icon: Wallet, label: "Saved traveller and payment details — repeat booking in ~30 seconds" },
  { icon: Gift, label: "₹500 referral credits and early access to seasonal inventory" },
];

export default function SignupPage() {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [consent, setConsent] = useState(true);
  const [done, setDone] = useState(false);

  return (
    <div className="container-page py-8 pb-20">
      <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <Breadcrumbs
            items={[{ label: "Dubai", href: "/" }, { label: "Sign up" }]}
            className="mb-3"
          />
          <h1 className="text-[1.75rem] sm:text-3xl">Create your account</h1>
          <p className="mt-1.5 text-[0.95rem] text-ink-600">
            Optional — you never need one to book. It just makes the second trip faster than the
            first.
          </p>

          <Card className="mt-6 p-5">
            {done ? (
              <Alert tone="success" title="Account created">
                <p>
                  Any bookings you&apos;ve already made with {form.phone || "this number"} or{" "}
                  {form.email || "this email"} have been linked automatically — you should see them
                  in My trips straight away.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink href="/account/bookings" size="sm">
                    See my trips
                  </ButtonLink>
                  <ButtonLink href="/search" size="sm" variant="outline">
                    Browse experiences
                  </ButtonLink>
                </div>
              </Alert>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setDone(true);
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="su-name" className="mb-1 block text-sm font-bold text-ink-900">
                    Your name
                  </label>
                  <input
                    id="su-name"
                    value={form.name}
                    autoComplete="name"
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
                  />
                </div>
                <div>
                  <label htmlFor="su-phone" className="mb-1 block text-sm font-bold text-ink-900">
                    Mobile number
                  </label>
                  <div className="flex gap-2">
                    <select
                      aria-label="Country code"
                      className="min-h-12 rounded-[var(--radius-control)] border border-ink-200 bg-paper px-2 text-sm font-semibold"
                    >
                      <option>+91</option>
                      <option>+971</option>
                    </select>
                    <input
                      id="su-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    We verify with a one-time code. Bookings made as a guest with this number get
                    linked automatically.
                  </p>
                </div>
                <div>
                  <label htmlFor="su-email" className="mb-1 block text-sm font-bold text-ink-900">
                    Email
                  </label>
                  <input
                    id="su-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
                  />
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4.5 w-4.5 rounded accent-ink-900"
                  />
                  <span>
                    Send me trip updates and seasonal offers on WhatsApp.{" "}
                    <span className="text-ink-500">
                      Booking confirmations and vouchers are sent regardless — this is only for
                      marketing, and one tap turns it off.
                    </span>
                  </span>
                </label>

                <Button type="submit" block size="lg">
                  Create account
                </Button>
                <p className="text-center text-xs text-ink-500">
                  By continuing you agree to our{" "}
                  <Link href="/terms" className="font-bold text-sun-700 underline">
                    terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="font-bold text-sun-700 underline">
                    privacy policy
                  </Link>
                  .
                </p>
              </form>
            )}
          </Card>

          <p className="mt-4 text-sm text-ink-600">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-sun-700 underline underline-offset-2">
              Log in
            </Link>
            .
          </p>
        </div>

        <div>
          <div className="hidden aspect-[4/3] overflow-hidden rounded-[var(--radius-tile)] lg:block">
            <Scene src="marina-dusk" alt="Dubai Marina at dusk" />
          </div>
          <Card className="mt-4 p-5">
            <h2 className="text-lg">What the account actually does</h2>
            <ul className="mt-3 space-y-2.5">
              {BENEFITS.map((b) => (
                <li key={b.label} className="flex gap-2.5 text-sm text-ink-700">
                  <b.icon className="mt-0.5 h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
                  {b.label}
                </li>
              ))}
            </ul>
            <p className={cn("mt-4 rounded-[var(--radius-control)] bg-shell p-3 text-xs leading-relaxed text-ink-600")}>
              We don&apos;t require an account to book, and we won&apos;t ask again at checkout. If
              you only want your voucher, use{" "}
              <Link href="/manage-booking" className="font-bold text-sun-700 underline">
                Find my booking
              </Link>
              .
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

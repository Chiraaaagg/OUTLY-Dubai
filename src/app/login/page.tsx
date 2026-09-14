"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyRound, Smartphone } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { cn } from "@/lib/utils";

/**
 * LOGIN — phone OTP primary, email secondary (AC-ACC-01).
 *
 * Phone-first because that is how this audience authenticates everywhere else,
 * and because the phone number is already the key we deliver vouchers to.
 * MOCK: no auth backend in this build; the OTP step is rendered so the flow and
 * its states are reviewable.
 */
export default function LoginPage() {
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [step, setStep] = useState<"identify" | "otp">("identify");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  return (
    <div className="container-page py-8 pb-20">
      <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-2 lg:items-center">
        <div className="hidden aspect-[4/3] overflow-hidden rounded-[var(--radius-tile)] lg:block">
          <Scene src="skyline-gold" alt="Dubai skyline at golden hour" />
        </div>

        <div>
          <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Log in" }]} className="mb-3" />
          <h1 className="text-[1.75rem] sm:text-3xl">Log in</h1>
          <p className="mt-1.5 text-[0.95rem] text-ink-600">
            An account keeps your vouchers in one place and lets you cancel or change dates yourself.
            You don&apos;t need one to book.
          </p>

          <Card className="mt-6 p-5">
            {step === "identify" ? (
              <>
                <div
                  className="mb-4 flex rounded-full bg-ink-100 p-1"
                  role="group"
                  aria-label="Login method"
                >
                  {(["phone", "email"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                      className={cn(
                        "min-h-10 flex-1 rounded-full text-sm font-bold transition-colors",
                        mode === m ? "bg-paper text-ink-900 shadow-[var(--shadow-soft)]" : "text-ink-600",
                      )}
                    >
                      {m === "phone" ? "Phone" : "Email"}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (mode === "phone" && !/^\d{10}$/.test(phone.replace(/\s/g, ""))) {
                      setError("Enter the 10-digit number you booked with.");
                      return;
                    }
                    setError(null);
                    setSending(true);
                    window.setTimeout(() => {
                      setSending(false);
                      setStep("otp");
                    }, 700);
                  }}
                  className="space-y-4"
                >
                  {mode === "phone" ? (
                    <div>
                      <label htmlFor="login-phone" className="mb-1 block text-sm font-bold text-ink-900">
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
                          id="login-phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          aria-invalid={Boolean(error)}
                          className={cn(
                            "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900",
                            error ? "border-[var(--color-danger)]" : "border-ink-200",
                          )}
                        />
                      </div>
                      {error && (
                        <p className="mt-1 text-xs font-semibold text-[var(--color-danger)]">{error}</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="login-email" className="mb-1 block text-sm font-bold text-ink-900">
                        Email address
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
                      />
                    </div>
                  )}

                  <Button type="submit" block size="lg" loading={sending}>
                    <Smartphone className="h-[1.15rem] w-[1.15rem]" />
                    Send me a code
                  </Button>
                </form>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(otp === "000000" ? null : "That code doesn't match. Codes expire after 10 minutes.");
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="otp" className="mb-1 block text-sm font-bold text-ink-900">
                    Enter the 6-digit code
                  </label>
                  <p className="mb-2 text-xs text-ink-500">
                    Sent to {phone || "your number"} on WhatsApp and SMS.
                  </p>
                  <input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    aria-invalid={Boolean(error)}
                    className={cn(
                      "min-h-14 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-center font-display text-2xl font-bold tracking-[0.4em] tnum outline-none focus:border-ink-900",
                      error ? "border-[var(--color-danger)]" : "border-ink-200",
                    )}
                  />
                  {error && (
                    <p className="mt-1 text-xs font-semibold text-[var(--color-danger)]">{error}</p>
                  )}
                </div>

                <Alert tone="info">
                  This build has no auth backend. Use <strong className="font-bold">000000</strong> to
                  see the success path.
                </Alert>

                <Button type="submit" block size="lg">
                  <KeyRound className="h-[1.15rem] w-[1.15rem]" />
                  Log in
                </Button>
                <button
                  type="button"
                  onClick={() => setStep("identify")}
                  className="w-full text-sm font-bold text-sun-700 underline underline-offset-2"
                >
                  Use a different number
                </button>
              </form>
            )}
          </Card>

          <div className="mt-4 space-y-2 text-sm">
            <p className="text-ink-600">
              No account?{" "}
              <Link href="/signup" className="font-bold text-sun-700 underline underline-offset-2">
                Create one
              </Link>
              .
            </p>
            <p className="text-ink-600">
              Just want your voucher?{" "}
              <Link
                href="/manage-booking"
                className="font-bold text-sun-700 underline underline-offset-2"
              >
                Find a booking by reference
              </Link>{" "}
              — no account needed.
            </p>
          </div>

          <div className="mt-6">
            <ButtonLink href="/account" variant="outline" block>
              Skip — view the demo account
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}

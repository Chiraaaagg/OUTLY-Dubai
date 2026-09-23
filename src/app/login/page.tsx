"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { KeyRound, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card, Skeleton } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { ApiError, requestOtp, verifyOtp } from "@/lib/api";
import { track } from "@/lib/analytics";
import { normalisePhone } from "@/lib/phone";
import { safeNext } from "@/lib/safe-next";
import { serverErrorCode } from "@/lib/server-error";
import { cn } from "@/lib/utils";

/**
 * SIGN IN — phone + one-time code, nothing else (customer-auth contract §1, §4).
 *
 * Identity is the WhatsApp number we already reply on. No passwords, no
 * email step, no "create an account" — the account exists the first time a
 * code is verified, and every inquiry made with that number is linked then.
 *
 * Two steps on one card: number → code. The code field auto-submits at six
 * digits, resend unlocks after 30 s, and "wrong number?" goes back without
 * losing the country code. `?next=` is honoured only for storefront paths
 * (`safeNext`). When the API says sign-in is not configured for this
 * environment (503 NOT_CONFIGURED) the page says so and points at the guest
 * tracker instead of pretending.
 *
 * Layout pattern: single-column auth card, the same shell as the admin
 * sign-in — kept deliberately plain; there is nothing to sell here.
 */

const RESEND_AFTER_SECONDS = 30;
const CODE_LENGTH = 6;

const INPUT =
  "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] text-ink-900 outline-none focus:border-ink-900 disabled:opacity-60";

type Step = "phone" | "code" | "disabled";

interface Challenge {
  challengeId: string;
  expiresInSeconds: number;
  phoneMasked: string;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-8">
          <Skeleton className="mx-auto h-96 max-w-md rounded-[var(--radius-tile)]" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const submittedCode = useRef<string | null>(null);

  useEffect(() => {
    track("page_view", { page_type: "login" });
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const sendCode = async (): Promise<boolean> => {
    const parsed = normalisePhone(phone, countryCode);
    if (!phone.trim()) {
      setPhoneError("Enter the WhatsApp number you used for your inquiry.");
      return false;
    }
    if (!parsed.valid) {
      setPhoneError(parsed.reason ?? "That doesn't look like a valid mobile number.");
      return false;
    }
    setPhoneError(null);
    setNotice(null);
    setSending(true);
    try {
      const result = await requestOtp({ phone: parsed.national, countryCode: parsed.countryCode });
      setChallenge(result);
      setCode("");
      setCodeError(null);
      submittedCode.current = null;
      setResendIn(RESEND_AFTER_SECONDS);
      setStep("code");
      return true;
    } catch (err) {
      const serverCode = serverErrorCode(err);
      if (serverCode === "NOT_CONFIGURED") {
        setStep("disabled");
      } else if (serverCode === "RATE_LIMITED") {
        setPhoneError(
          "Too many codes requested for this number. Wait fifteen minutes and try again, or track your inquiry with the reference instead.",
        );
      } else if (err instanceof ApiError) {
        setPhoneError(err.fields?.phone ?? err.recovery);
      } else {
        setPhoneError("We couldn't send the code. Try again in a moment.");
      }
      return false;
    } finally {
      setSending(false);
    }
  };

  const verify = async (value: string) => {
    if (!challenge || verifying) return;
    if (value.length !== CODE_LENGTH) {
      setCodeError("Enter all six digits.");
      return;
    }
    submittedCode.current = value;
    setVerifying(true);
    setCodeError(null);
    try {
      await verifyOtp({ challengeId: challenge.challengeId, code: value });
      router.replace(next);
      router.refresh();
    } catch (err) {
      const serverCode = serverErrorCode(err);
      if (serverCode === "NOT_FOUND" || serverCode === "UNAUTHORIZED") {
        // The challenge expired or was used up — start over rather than let them keep typing.
        setCodeError("That code has expired. Request a new one.");
        setResendIn(0);
      } else if (serverCode === "RATE_LIMITED") {
        setCodeError("Too many attempts. Wait a few minutes and request a fresh code.");
      } else if (err instanceof ApiError) {
        setCodeError(err.fields?.code ?? err.recovery);
      } else {
        setCodeError("We couldn't check that code. Try again.");
      }
      setVerifying(false);
    }
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (codeError) setCodeError(null);
    // Auto-submit once, on the first time six digits appear.
    if (digits.length === CODE_LENGTH && submittedCode.current !== digits) void verify(digits);
  };

  const resend = async () => {
    if (resendIn > 0 || sending) return;
    const ok = await sendCode();
    if (ok) setNotice("A new code is on its way. The old one no longer works.");
  };

  return (
    <div className="container-page py-8 pb-20">
      <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-2 lg:items-center">
        <div className="hidden aspect-[4/3] overflow-hidden rounded-[var(--radius-tile)] lg:block">
          <Scene src="skyline-gold" alt="Dubai skyline at golden hour" />
        </div>

        <div>
          <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Sign in" }]} className="mb-3" />
          <h1 className="text-[1.75rem] sm:text-3xl">Sign in</h1>
          <p className="mt-1.5 text-[0.95rem] text-ink-600">
            Use the WhatsApp number from your inquiry. We send a one-time code — no password, and
            nothing to set up. You never need to sign in to ask us about a trip.
          </p>

          <Card className="mt-6 p-5">
            {step === "disabled" && <DisabledState />}

            {step === "phone" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
                className="space-y-4"
                noValidate
              >
                <div>
                  <label htmlFor="login-phone" className="mb-1 block text-sm font-bold text-ink-900">
                    WhatsApp number
                  </label>
                  <div className="flex gap-2">
                    <select
                      aria-label="Country code"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="min-h-12 rounded-[var(--radius-control)] border border-ink-200 bg-paper px-2 text-sm font-semibold"
                    >
                      <option value="+91">+91</option>
                      <option value="+971">+971</option>
                    </select>
                    <input
                      id="login-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (phoneError) setPhoneError(null);
                      }}
                      aria-invalid={Boolean(phoneError)}
                      aria-describedby={phoneError ? "login-phone-err" : "login-phone-hint"}
                      className={cn(INPUT, phoneError ? "border-[var(--color-danger)]" : "border-ink-200")}
                    />
                  </div>
                  {phoneError ? (
                    <p id="login-phone-err" className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
                      {phoneError}
                    </p>
                  ) : (
                    <p id="login-phone-hint" className="mt-1 text-xs text-ink-500">
                      The code goes to this number. We don&apos;t use it for anything else.
                    </p>
                  )}
                </div>

                <Button type="submit" block size="lg" loading={sending} loadingLabel="Sending the code…">
                  <Smartphone className="h-[1.15rem] w-[1.15rem]" />
                  Send me a code
                </Button>

                {/* Creating an account is a contract; the terms are named before it happens. */}
                <p className="text-xs leading-relaxed text-ink-500">
                  Signing in creates your OUTLYY account if you don&apos;t have one. By continuing you
                  agree to our{" "}
                  <Link href="/terms" className="font-semibold underline underline-offset-2 hover:text-ink-700">
                    Terms
                  </Link>{" "}
                  and confirm you have read the{" "}
                  <Link href="/privacy" className="font-semibold underline underline-offset-2 hover:text-ink-700">
                    Privacy Policy
                  </Link>
                  . We send the code by SMS or WhatsApp to verify it is you — never for marketing.
                </p>
              </form>
            )}

            {step === "code" && challenge && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify(code);
                }}
                className="space-y-4"
                noValidate
              >
                <div>
                  <label htmlFor="login-code" className="mb-1 block text-sm font-bold text-ink-900">
                    Enter the 6-digit code
                  </label>
                  <p className="mb-2 text-xs text-ink-500">
                    Sent to <span className="font-semibold tnum text-ink-700">{challenge.phoneMasked}</span>.
                    It works for {Math.max(1, Math.round(challenge.expiresInSeconds / 60))} minutes.
                  </p>
                  <input
                    ref={codeRef}
                    id="login-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={CODE_LENGTH}
                    value={code}
                    disabled={verifying}
                    onChange={(e) => onCodeChange(e.target.value)}
                    aria-invalid={Boolean(codeError)}
                    aria-describedby={codeError ? "login-code-err" : undefined}
                    className={cn(
                      "min-h-14 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-center font-display text-2xl font-bold tracking-[0.4em] tnum text-ink-900 outline-none focus:border-ink-900 disabled:opacity-60",
                      codeError ? "border-[var(--color-danger)]" : "border-ink-200",
                    )}
                  />
                  {codeError && (
                    <p id="login-code-err" className="mt-1 text-xs font-semibold text-[var(--color-danger)]" role="alert">
                      {codeError}
                    </p>
                  )}
                </div>

                {notice && <Alert tone="success">{notice}</Alert>}

                <Button type="submit" block size="lg" loading={verifying} loadingLabel="Checking…">
                  <KeyRound className="h-[1.15rem] w-[1.15rem]" />
                  Sign in
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                  <button
                    type="button"
                    onClick={() => void resend()}
                    disabled={resendIn > 0 || sending}
                    className="min-h-11 font-bold text-sun-700 underline underline-offset-2 disabled:no-underline disabled:opacity-60"
                  >
                    {sending ? "Sending…" : resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setCode("");
                      setCodeError(null);
                      setNotice(null);
                    }}
                    className="min-h-11 font-bold text-ink-700 underline underline-offset-2"
                  >
                    Wrong number?
                  </button>
                </div>
              </form>
            )}
          </Card>

          <div className="mt-4 space-y-2 text-sm text-ink-600">
            <p>
              Just checking on one inquiry?{" "}
              <Link href="/inquiry/track" className="font-bold text-sun-700 underline underline-offset-2">
                Track it with your reference
              </Link>{" "}
              — no sign-in needed.
            </p>
            <p>
              Have a paid booking?{" "}
              <Link href="/manage-booking" className="font-bold text-sun-700 underline underline-offset-2">
                Find it by reference
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Honest state when no SMS provider is configured (contract §1). Never fakes a code. */
function DisabledState() {
  return (
    <div>
      <Alert tone="info" title="Sign-in is coming soon">
        We haven&apos;t switched on one-time codes for this site yet. Track your inquiry with its
        reference and the phone number you used instead — it shows the same status, agent and next
        step.
      </Alert>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/inquiry/track"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-control)] bg-sun-500 px-4 text-[0.95rem] font-semibold text-white shadow-[0_2px_0_var(--color-sun-700)] hover:bg-sun-600"
        >
          Track my inquiry
        </Link>
        <Link
          href="/search"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-control)] border border-ink-300 bg-white px-4 text-[0.95rem] font-semibold text-ink-900 hover:bg-shell"
        >
          Browse experiences
        </Link>
      </div>
    </div>
  );
}

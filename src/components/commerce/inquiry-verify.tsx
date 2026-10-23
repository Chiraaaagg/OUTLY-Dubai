"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { serverErrorCode } from "@/lib/server-error";
// The hCaptcha container is owned by the form, not this panel: it must exist
// before the first send, and one element with that id has to serve both.
import { type OtpAttempt } from "@/lib/otp-flow";
import { cn } from "@/lib/utils";

/**
 * The code step inside the inquiry flow.
 *
 * Deliberately not a sign-in screen. The inquiry is written and ready; this is
 * the last confirmation before it goes out, so the copy talks about the
 * inquiry, never about accounts, signing in or registering. The visitor never
 * leaves the page and never loses what they typed — if they close this, the
 * filled-in form is still behind it.
 *
 * Rendered as a panel over the form rather than a route, for the same reason:
 * a navigation here would read as a signup wall and would throw away the form
 * state on back.
 */

const CODE_LENGTH = 6;
const RESEND_AFTER_SECONDS = 30;

const INPUT =
  "min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-center text-lg font-bold tracking-[0.4em] tnum text-ink-900 outline-none focus:border-ink-900 disabled:opacity-60";

export function InquiryVerify({
  attempt,
  onAttemptChange,
  onVerified,
  onCancel,
  sending,
  className,
}: {
  attempt: OtpAttempt;
  onAttemptChange: (next: OtpAttempt) => void;
  /** Runs after the session exists. The caller creates the inquiry here. */
  onVerified: () => void | Promise<void>;
  onCancel: () => void;
  /** True while the caller is creating the inquiry, so the panel stays busy. */
  sending: boolean;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_AFTER_SECONDS);
  const inputRef = useRef<HTMLInputElement>(null);
  // Auto-submit must fire once per distinct code, or a failed attempt would
  // retry itself forever as React re-renders.
  const submitted = useRef<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const verify = async (value: string) => {
    if (busy || sending) return;
    if (value.length !== CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits.`);
      return;
    }
    submitted.current = value;
    setBusy(true);
    setError(null);
    try {
      await attempt.verify(value);
      track("otp_verified", { context: "inquiry" });
      await onVerified();
    } catch (err) {
      const serverCode = serverErrorCode(err);
      if (serverCode === "NOT_FOUND" || serverCode === "UNAUTHORIZED") {
        setError("That code has expired. Send a new one.");
        setResendIn(0);
      } else if (serverCode === "RATE_LIMITED") {
        setError("Too many attempts. Wait a few minutes, then send a fresh code.");
      } else if (err instanceof ApiError) {
        setError(err.fields?.code ?? err.recovery);
      } else if (err instanceof Error && err.message === "no_access_token") {
        // The code was right but the provider's response did not contain a
        // token we recognise. Distinct copy so this is not mistaken for a
        // wrong code — it is our problem, not the customer's.
        setError("Your code was accepted but we couldn't finish signing you in. Please try once more.");
      } else {
        setError("We couldn't check that code. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === CODE_LENGTH && submitted.current !== digits) void verify(digits);
  };

  const resend = async () => {
    if (busy || sending || resendIn > 0) return;
    setBusy(true);
    setError(null);
    try {
      const next = await attempt.resend();
      onAttemptChange(next);
      track("otp_sent", { context: "inquiry", resend: true });
      setCode("");
      submitted.current = null;
      setResendIn(RESEND_AFTER_SECONDS);
      inputRef.current?.focus();
    } catch {
      setError("We couldn't send another code just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const locked = busy || sending;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5 shadow-[var(--shadow-card)]",
        className,
      )}
      role="group"
      aria-labelledby="iq-verify-title"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="iq-verify-title" className="text-base font-bold text-ink-900">
            One last thing
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            We sent a {CODE_LENGTH}-digit code to <strong className="text-ink-900">{attempt.phoneMasked}</strong>.
            Enter it and your inquiry goes straight to an agent. This is how we know the number is
            reachable before someone spends time on a reply.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="iq-code" className="sr-only">
          {CODE_LENGTH}-digit code
        </label>
        <input
          ref={inputRef}
          id="iq-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          disabled={locked}
          onChange={(e) => onCodeChange(e.target.value)}
          className={cn(INPUT, error && "border-[var(--color-danger)]")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "iq-code-error" : undefined}
        />
        {error && (
          <p id="iq-code-error" className="mt-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Button
          type="button"
          block
          size="lg"
          loading={locked}
          loadingLabel={sending ? "Sending your inquiry…" : "Checking…"}
          onClick={() => void verify(code)}
        >
          Confirm and send inquiry
        </Button>

        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => void resend()}
            disabled={locked || resendIn > 0}
            className="font-semibold text-ink-700 underline underline-offset-2 disabled:no-underline disabled:opacity-50"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Send another code"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={locked}
            className="text-ink-500 underline underline-offset-2 disabled:opacity-50"
          >
            Change number
          </button>
        </div>
      </div>

      <Alert tone="info" className="mt-4">
        Nothing you typed is lost. Go back, change anything, and send again.
      </Alert>
    </div>
  );
}

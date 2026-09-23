"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { AUTH_INPUT, AuthCard, AuthError, isApiFailure, postJson, safeNext, type ApiFailure } from "../auth-client";

interface Enrolment {
  secret: string;
  otpauthUri: string;
}

/** Groups a base32 secret in blocks of four so it can be typed by hand. */
function groupSecret(s: string) {
  return s.replace(/(.{4})/g, "$1 ").trim();
}

export function EnrolForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  // One secret per visit: the service overwrites any previous unconfirmed secret.
  useEffect(() => {
    let cancelled = false;
    postJson<Enrolment>("/api/admin/auth/totp/enrol")
      .then((r) => {
        if (!cancelled) setEnrolment(r);
      })
      .catch((err) => {
        if (!cancelled) setError(isApiFailure(err) ? err : { code: "error", message: "Could not start enrolment" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await postJson<{ ok: true }>("/api/admin/auth/totp/verify", { code: code.trim() });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(isApiFailure(err) ? err : { code: "error", message: "Something went wrong" });
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Set up two-factor"
      sub="Every staff account needs an authenticator app. Add OUTLYY to Google Authenticator, Authy or 1Password, then confirm with a code."
      footer={
        <Link href="/admin/login" className="font-semibold text-ink-800 underline underline-offset-2">
          Back to sign in
        </Link>
      }
    >
      <AuthError error={error} />
      {loading && <p className="text-sm text-ink-600">Generating your secret…</p>}
      {enrolment && (
        <div className="space-y-4">
          <div className="rounded-[var(--radius-control)] border border-ink-200 bg-shell/60 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Setup key</p>
            <p className="mt-1 break-all font-mono text-base font-semibold tracking-wider text-ink-900" aria-label="Authenticator setup key">
              {groupSecret(enrolment.secret)}
            </p>
            <p className="mt-2 text-xs text-ink-600">Type it into your app as a time-based key, or on this device:</p>
            <a
              href={enrolment.otpauthUri}
              className="mt-2 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-ink-300 bg-paper px-3.5 text-sm font-semibold text-ink-900 hover:border-ink-600"
            >
              Open in authenticator app
            </a>
          </div>
          <Alert tone="warning" title="Keep this key private">
            It is shown once. Anyone with it can generate your codes.
          </Alert>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="code" className="block text-sm font-semibold text-ink-800">
                Code from your app
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${AUTH_INPUT} text-center text-2xl tracking-[0.4em] tnum`}
              />
            </div>
            <Button type="submit" block loading={busy} loadingLabel="Confirming…" disabled={code.length !== 6}>
              Confirm and sign in
            </Button>
          </form>
        </div>
      )}
    </AuthCard>
  );
}

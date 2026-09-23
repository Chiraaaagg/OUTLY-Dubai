"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AUTH_INPUT, AuthCard, AuthError, isApiFailure, postJson, safeNext, type ApiFailure } from "../auth-client";

export function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

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
      title="Enter your code"
      sub="Open your authenticator app and type the 6-digit code for OUTLYY."
      footer={
        <Link href="/admin/login" className="font-semibold text-ink-800 underline underline-offset-2">
          Use a different account
        </Link>
      }
    >
      <AuthError error={error} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="code" className="block text-sm font-semibold text-ink-800">
            Authenticator code
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
            autoFocus
          />
        </div>
        <Button type="submit" block loading={busy} loadingLabel="Verifying…" disabled={code.length !== 6}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}

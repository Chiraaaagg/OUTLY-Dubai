"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AUTH_INPUT, AuthCard, AuthError, isApiFailure, postJson, safeNext, type ApiFailure } from "../auth-client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { next: stage } = await postJson<{ next: "totp" | "enrol" }>("/api/admin/auth/login", { email, password });
      const q = next !== "/admin/inquiries" ? `?next=${encodeURIComponent(next)}` : "";
      router.push(stage === "enrol" ? `/admin/enrol${q}` : `/admin/verify${q}`);
    } catch (err) {
      setError(isApiFailure(err) ? err : { code: "error", message: "Something went wrong" });
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" sub="Staff only. You will be asked for your authenticator code next.">
      <AuthError error={error} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-semibold text-ink-800">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-semibold text-ink-800">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <Button type="submit" block loading={busy} loadingLabel="Checking…">
          Continue
        </Button>
      </form>
    </AuthCard>
  );
}

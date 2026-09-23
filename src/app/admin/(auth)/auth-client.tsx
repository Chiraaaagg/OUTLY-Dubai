"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";
import { Alert } from "@/components/ui/primitives";

/**
 * Shared pieces for the sign-in steps. All three pages talk to the existing
 * `/api/admin/auth/*` routes with same-origin cookies; nothing here touches
 * the session directly.
 */

export interface ApiFailure {
  code: string;
  message: string;
  recovery?: string;
}

/** POST JSON to an auth route; resolves the body or rejects with the §12 envelope. */
export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw { code: "offline", message: "We couldn't reach the server", recovery: "Check your connection and try again." } satisfies ApiFailure;
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: ApiFailure }) | null;
  if (!res.ok) {
    throw (data?.error ?? { code: "error", message: "Something went wrong", recovery: "Try again in a moment." }) satisfies ApiFailure;
  }
  return data as T;
}

export function isApiFailure(e: unknown): e is ApiFailure {
  return typeof e === "object" && e !== null && "message" in e;
}

/** Only allow same-site admin paths as a post-login destination. */
export function safeNext(raw: string | null | undefined): string {
  const fallback = "/admin/inquiries";
  if (!raw || raw.length > 512) return fallback;
  // Exactly "/admin", or "/admin" followed by "/", "?" or "#". A single leading slash can never be
  // scheme-relative ("//host") or absolute ("scheme://"). Backslashes, whitespace and control characters
  // are rejected outright — browsers normalise "\\" to "/" and strip tabs/newlines before parsing.
  if (!/^\/admin(?:[/?#]|$)/.test(raw) || /[\\\s\u0000-\u001f\u007f]/.test(raw) || raw.includes("://")) return fallback;
  if (/^\/admin\/(login|verify|enrol)(?:[/?#]|$)/.test(raw)) return fallback;
  return raw;
}

export function AuthCard({ title, sub, children, footer }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-6 shadow-[var(--shadow-soft)] sm:p-7">
      <div className="mb-5 flex items-center gap-2">
        <Logo />
        <span className="rounded-full bg-ink-900 px-2 py-0.5 text-2xs font-extrabold uppercase tracking-wider text-dune-200">Admin</span>
      </div>
      <h1 className="text-2xl leading-tight">{title}</h1>
      {sub && <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{sub}</p>}
      <div className="mt-5">{children}</div>
      {footer && <div className="mt-5 border-t border-ink-200 pt-4 text-sm text-ink-600">{footer}</div>}
    </div>
  );
}

export function AuthError({ error }: { error: ApiFailure | null }) {
  if (!error) return null;
  return (
    <Alert tone="danger" title={error.message} className="mb-4">
      {error.recovery}
      {(error.code === "UNAUTHORIZED" || error.code === "TOTP_ENROLMENT_REQUIRED") && (
        <>
          {" "}
          <Link href="/admin/login" className="font-semibold underline underline-offset-2">
            Back to sign in
          </Link>
        </>
      )}
    </Alert>
  );
}

export const AUTH_INPUT =
  "block w-full min-h-11 rounded-[var(--radius-control)] border border-ink-300 bg-paper px-3 text-[0.95rem] text-ink-900 placeholder:text-ink-400 focus:border-ink-700 disabled:opacity-60";

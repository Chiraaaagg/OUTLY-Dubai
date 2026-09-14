"use client";

import Link from "next/link";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { cn } from "@/lib/utils";

/**
 * Toaster. Positioned above the mobile sticky bar so it never covers the
 * primary booking CTA. aria-live=polite so it is announced without stealing
 * focus mid-form.
 */
export function Toaster() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0"
    >
      {toasts.map((t) => {
        const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? XCircle : Info;
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-control)] border bg-paper p-3.5 shadow-[var(--shadow-pop)] animate-[rise_0.28s_var(--ease-out-soft)]",
              t.tone === "success" && "border-[color-mix(in_oklab,var(--color-success)_35%,white)]",
              t.tone === "error" && "border-[color-mix(in_oklab,var(--color-danger)_35%,white)]",
              t.tone === "info" && "border-ink-200",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                t.tone === "success" && "text-[var(--color-success)]",
                t.tone === "error" && "text-[var(--color-danger)]",
                t.tone === "info" && "text-lagoon-500",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-900">{t.title}</p>
              {t.body && <p className="mt-0.5 text-sm leading-snug text-ink-600">{t.body}</p>}
              {t.action && (
                <Link
                  href={t.action.href}
                  className="mt-1.5 inline-block text-sm font-bold text-sun-600 underline underline-offset-2"
                >
                  {t.action.label}
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Dismiss</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

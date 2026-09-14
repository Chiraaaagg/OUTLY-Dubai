import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Button — the conversion primitive.
 *
 * Variants map to a strict hierarchy so a page never has two things competing
 * to be the primary action:
 *   primary   → the booking action. One per view (plus its sticky-bar twin).
 *   whatsapp  → the assisted rail. Equal visual weight to primary on the ADP
 *               (PRD §5.2 item 7) but visually distinct so it never reads as
 *               "the same button in a different colour".
 *   secondary → supporting navigation (view details, see all).
 *   ghost     → tertiary, in-card and toolbar actions.
 *   danger    → destructive confirmations only (cancel booking).
 *
 * Every variant meets 4.5:1 against its own background. `loading` keeps the
 * label in the DOM so screen readers don't lose context mid-transaction.
 */

type Variant = "primary" | "whatsapp" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold " +
  "transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-out-soft)] " +
  "disabled:pointer-events-none disabled:opacity-55 active:translate-y-px " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink-800";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-sun-500 text-white shadow-[0_2px_0_var(--color-sun-700)] hover:bg-sun-600 hover:shadow-[0_1px_0_var(--color-sun-700)]",
  whatsapp:
    "bg-white text-ink-900 border-2 border-whatsapp shadow-[0_2px_0_var(--color-whatsapp-dark)] hover:bg-[#f2fdf6]",
  secondary: "bg-ink-900 text-white hover:bg-ink-800",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-100",
  outline: "bg-white text-ink-900 border border-ink-300 hover:border-ink-500 hover:bg-shell",
  danger: "bg-white text-[var(--color-danger)] border-2 border-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]",
};

const SIZES: Record<Size, string> = {
  // 44px minimum touch target on md/lg per PRD §6.
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-[0.95rem]",
  lg: "min-h-13 px-6 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
  children: ReactNode;
}

function classes({ variant = "primary", size = "md", block, className }: CommonProps) {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

export function Button({
  variant,
  size,
  block,
  loading,
  loadingLabel,
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      {...rest}
      aria-busy={loading || undefined}
      disabled={rest.disabled || loading}
      className={classes({ variant, size, block, className, children })}
    >
      {loading && <Spinner />}
      <span className={cn(loading && "opacity-90")}>
        {loading ? (loadingLabel ?? children) : children}
      </span>
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  children,
  href,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link {...rest} href={href} className={classes({ variant, size, block, className, children })}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4 animate-spin", className)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

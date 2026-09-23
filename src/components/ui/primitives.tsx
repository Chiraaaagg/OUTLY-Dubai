import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronRight, Info, RefreshCw, Star, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/* ---------------------------------------------------------------------------
 * Surfaces
 * ------------------------------------------------------------------------ */

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section" | "li";
}) {
  return (
    <As
      className={cn(
        "rounded-[var(--radius-card)] border border-ink-200 bg-paper shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function SectionHeading({
  kicker,
  title,
  sub,
  href,
  hrefLabel = "See all",
  className,
  id,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  href?: string;
  hrefLabel?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-end justify-between gap-4", className)}>
      <div className="max-w-2xl">
        {kicker && (
          <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.14em] text-sun-600">
            {kicker}
          </p>
        )}
        <h2 id={id} className="text-2xl leading-tight sm:text-[1.75rem]">
          {title}
        </h2>
        {sub && <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-600">{sub}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="hidden shrink-0 items-center gap-1 rounded-full border border-ink-300 px-3.5 py-2 text-sm font-semibold text-ink-800 transition-colors hover:border-ink-900 hover:bg-white sm:inline-flex"
        >
          {hrefLabel}
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Rating
 * ------------------------------------------------------------------------ */

export function Rating({
  value,
  count,
  size = "sm",
  showCount = true,
  className,
}: {
  value: number;
  count?: number;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
  className?: string;
}) {
  const dims = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-5 w-5" }[size];
  const text = { sm: "text-sm", md: "text-[0.95rem]", lg: "text-base" }[size];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", text, className)}
      aria-label={`Rated ${value} out of 5${count ? ` from ${count} verified reviews` : ""}`}
    >
      <Star className={cn(dims, "fill-dune-400 text-dune-400")} aria-hidden="true" />
      <span className="font-bold tnum">{value.toFixed(1)}</span>
      {showCount && count != null && (
        <span className="text-ink-500 tnum">({count.toLocaleString("en-IN")})</span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Feedback
 * ------------------------------------------------------------------------ */

type AlertTone = "info" | "warning" | "danger" | "success";

const ALERT_TONES: Record<AlertTone, string> = {
  info: "border-[color-mix(in_oklab,var(--color-info)_30%,white)] bg-[var(--color-info-bg)] text-[color-mix(in_oklab,var(--color-info)_80%,black)]",
  warning: "border-[color-mix(in_oklab,var(--color-warning)_30%,white)] bg-[var(--color-warning-bg)] text-[color-mix(in_oklab,var(--color-warning)_85%,black)]",
  danger: "border-[color-mix(in_oklab,var(--color-danger)_30%,white)] bg-[var(--color-danger-bg)] text-[color-mix(in_oklab,var(--color-danger)_82%,black)]",
  success: "border-[color-mix(in_oklab,var(--color-success)_30%,white)] bg-[var(--color-success-bg)] text-[color-mix(in_oklab,var(--color-success)_78%,black)]",
};

export function Alert({
  tone = "info",
  title,
  children,
  icon,
  action,
  className,
  id,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-[var(--radius-control)] border p-3.5 text-sm", ALERT_TONES[tone], className)}
    >
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          {icon ?? (tone === "info" ? <Info className="h-4.5 w-4.5" /> : <AlertTriangle className="h-4.5 w-4.5" />)}
        </span>
        <div className="min-w-0 flex-1">
          {title && <p className="font-bold">{title}</p>}
          {children && <div className={cn("leading-relaxed", title && "mt-0.5")}>{children}</div>}
          {action && <div className="mt-2.5">{action}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Loading / empty / error — the three states every list must implement
 * ------------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function ActivityCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-paper">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-7 w-32" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-live="polite"
      aria-label="Loading experiences"
    >
      {Array.from({ length: count }, (_, i) => (
        <ActivityCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** The brand pack's empty-state illustrations (brand/10-empty-states). */
export type EmptyIllustration =
  | "saved"
  | "bookings"
  | "inquiries"
  | "search"
  | "filters"
  | "cart"
  | "offline"
  | "notifications";

export function EmptyState({
  title,
  body,
  action,
  secondary,
  icon,
  illustration,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  secondary?: ReactNode;
  icon?: ReactNode;
  /**
   * Brand illustration to show instead of the icon disc. Decorative
   * (`alt=""`) — the heading and body already carry the meaning. Fixed
   * intrinsic size so it reserves its space and never shifts the layout.
   */
  illustration?: EmptyIllustration;
}) {
  return (
    <div className="rounded-[var(--radius-tile)] border border-dashed border-ink-300 bg-shell/60 px-6 py-12 text-center">
      {illustration ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/brand/empty/outlyy-empty-${illustration}.svg`}
          alt=""
          width={320}
          height={200}
          loading="lazy"
          decoding="async"
          className="mx-auto mb-4 h-auto w-[min(320px,80%)]"
        />
      ) : (
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sun-100 text-sun-600"
          aria-hidden="true"
        >
          {icon ?? <Info className="h-6 w-6" />}
        </div>
      )}
      <h3 className="text-lg">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">{body}</p>
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  title = "That didn't load",
  body,
  onRetry,
  offline,
  action,
}: {
  title?: string;
  body: string;
  onRetry?: () => void;
  offline?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-tile)] border border-[color-mix(in_oklab,var(--color-danger)_25%,white)] bg-[var(--color-danger-bg)]/50 px-6 py-10 text-center"
    >
      <div
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--color-danger)]"
        aria-hidden="true"
      >
        {offline ? <WifiOff className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
      </div>
      <h3 className="text-lg">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-700">{body}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        {onRetry && (
          <Button onClick={onRetry} variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Navigation
 * ------------------------------------------------------------------------ */

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-500">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />}
            {item.href ? (
              <Link href={item.href} className="rounded hover:text-ink-900 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-ink-700" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ---------------------------------------------------------------------------
 * Misc
 * ------------------------------------------------------------------------ */

export function Stat({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <p className="font-display text-2xl font-bold tnum text-ink-900 sm:text-3xl">{value}</p>
      <p className="mt-0.5 text-xs leading-snug text-ink-600">{label}</p>
    </div>
  );
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "space-y-4 text-[0.975rem] leading-[1.75] text-ink-700 [&_a]:font-semibold [&_a]:text-sun-700 [&_a]:underline [&_a]:underline-offset-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <hr className={cn("border-ink-200", className)} />;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <hr className="flex-1 border-ink-200" />
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <hr className="flex-1 border-ink-200" />
    </div>
  );
}

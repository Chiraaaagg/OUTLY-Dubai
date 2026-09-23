import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Admin-only presentational helpers. No hooks, no "use client" — usable from
 * Server Components and client components alike. Kept generic so the Agent
 * Console pages can reuse them. Props are documented in
 * docs/backend/impl/admin.md §"Shared components".
 *
 * Layout pattern: dense stat tiles + a bordered data table, built directly on
 * OUTLYY tokens (paper cards, ink text, sun accent, 44px controls). No
 * external pattern was copied.
 */

/* ------------------------------------------------------------ page header */

export function PageHeader({
  title,
  sub,
  actions,
  className,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight sm:text-[1.75rem]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-600">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- stat card */

export type StatTone = "neutral" | "good" | "warn" | "bad" | "accent";

const STAT_TONES: Record<StatTone, string> = {
  neutral: "text-ink-900",
  good: "text-[var(--color-success)]",
  warn: "text-[var(--color-warning)]",
  bad: "text-[var(--color-danger)]",
  accent: "text-sun-600",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  className,
}: {
  label: string;
  /** Already formatted — the card never formats numbers itself. */
  value: string;
  hint?: string;
  tone?: StatTone;
  /** Optional link target; the whole card becomes clickable. */
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
      <p className={cn("mt-1.5 font-display text-2xl font-bold leading-none tnum sm:text-3xl", STAT_TONES[tone])}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </>
  );
  const cls = cn("block rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4 shadow-[var(--shadow-soft)]", href && "transition-colors hover:border-ink-400", className);
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ------------------------------------------------------------- status pill */

export type PillTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const PILL_TONES: Record<PillTone, string> = {
  neutral: "bg-ink-100 text-ink-700 border-ink-200",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info)] border-[color-mix(in_oklab,var(--color-info)_28%,white)]",
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[color-mix(in_oklab,var(--color-success)_28%,white)]",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[color-mix(in_oklab,var(--color-warning)_28%,white)]",
  danger: "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[color-mix(in_oklab,var(--color-danger)_28%,white)]",
  accent: "bg-sun-50 text-sun-700 border-sun-200",
};

export function StatusPill({ tone = "neutral", children, className, title }: { tone?: PillTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold whitespace-nowrap", PILL_TONES[tone], className)}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- data table */

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Right-align numeric columns. */
  align?: "left" | "right";
}

/**
 * Bordered dense table that scrolls horizontally inside its own container on
 * narrow screens (the page never scrolls sideways). Rows are keyed by `rowKey`.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Nothing to show yet.",
  caption,
  className,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-[var(--radius-card)] border border-ink-200 bg-paper shadow-[var(--shadow-soft)]", className)}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-shell/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2.5", c.align === "right" && "text-right", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-ink-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-ink-200 align-top hover:bg-shell/40">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2.5", c.align === "right" && "text-right tnum", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------- form field */

export const INPUT_CLASS =
  "block w-full min-h-11 rounded-[var(--radius-control)] border border-ink-300 bg-paper px-3 text-[0.95rem] text-ink-900 " +
  "placeholder:text-ink-400 focus:border-ink-700 disabled:opacity-60 aria-[invalid=true]:border-[var(--color-danger)]";

/**
 * Label + control + optional hint/error. Pass the control as `children` with
 * `id` matching `htmlFor`; the field wires `aria-describedby` for the error.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  required,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-800">
        {label}
        {required && <span className="ml-0.5 text-sun-600" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-semibold text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- section */

export function Panel({ title, sub, children, className, actions }: { title?: string; sub?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4 shadow-[var(--shadow-soft)] sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-lg leading-tight">{title}</h2>}
            {sub && <p className="mt-0.5 text-sm text-ink-600">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------- key/value */

export function KeyValueList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-ink-200 text-sm", className)}>
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-ink-600">{it.label}</dt>
          <dd className="text-right font-semibold text-ink-900 tnum">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------- pagination */

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** Builds the link for a page number, preserving the current filters. */
  hrefFor: (page: number) => string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-ink-300 bg-paper px-3.5 text-sm font-semibold text-ink-800 hover:border-ink-600";
  return (
    <nav aria-label="Pagination" className={cn("mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600", className)}>
      <p className="tnum">
        {from}–{to} of {total.toLocaleString("en-IN")}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <a href={hrefFor(page - 1)} className={link}>
            Previous
          </a>
        ) : (
          <span className={cn(link, "opacity-50")} aria-disabled="true">
            Previous
          </span>
        )}
        <span className="tnum">
          Page {page} / {pages}
        </span>
        {page < pages ? (
          <a href={hrefFor(page + 1)} className={link}>
            Next
          </a>
        ) : (
          <span className={cn(link, "opacity-50")} aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

/* ----------------------------------------------------------- formatting */

/** The console clock, from the SLA timezone — never a hard-coded zone. */
export const ADMIN_TZ = process.env.NEXT_PUBLIC_SLA_TIMEZONE ?? "Asia/Dubai";
export const ADMIN_TZ_LABEL = ADMIN_TZ === "Asia/Kolkata" ? "IST" : ADMIN_TZ === "Asia/Dubai" ? "GST" : ADMIN_TZ;

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ADMIN_TZ });
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtPercent(ratio: number | null | undefined): string {
  return ratio == null ? "—" : `${Math.round(ratio * 100)}%`;
}

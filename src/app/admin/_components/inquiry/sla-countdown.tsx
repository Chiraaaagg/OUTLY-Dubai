"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { InquiryStatus } from "@/lib/types";
import { CONSOLE_TZ_LABEL, fmtDateTime, fmtMinutes, relative } from "./format";

/**
 * Time-based labels that must not drift between server and client. Both
 * components take `serverNow` (ms) as the initial clock so the first client
 * render matches the HTML exactly, then tick from the browser clock with the
 * server offset applied — an agent with a wrong laptop clock still sees the
 * SLA the server will enforce.
 */

function useClock(serverNow: number, intervalMs: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const offset = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);
    tick();
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [serverNow, intervalMs]);
  return now;
}

export function SlaCountdown({
  status,
  slaDueAt,
  slaBreachedAt,
  firstResponseAt,
  createdAt,
  serverNow,
  compact = false,
  className,
}: {
  status: InquiryStatus;
  slaDueAt?: string;
  slaBreachedAt?: string;
  firstResponseAt?: string;
  createdAt: string;
  serverNow: number;
  compact?: boolean;
  className?: string;
}) {
  const now = useClock(serverNow, 30_000);
  const awaitingReply = status === "new" || status === "assigned";

  if (!awaitingReply || firstResponseAt) {
    if (firstResponseAt) {
      const minutes = (new Date(firstResponseAt).getTime() - new Date(createdAt).getTime()) / 60_000;
      const late = Boolean(slaBreachedAt) || (slaDueAt ? new Date(firstResponseAt).getTime() > new Date(slaDueAt).getTime() : false);
      return (
        <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold tnum", late ? "text-[var(--color-warning)]" : "text-[var(--color-success)]", className)} title={`First reply ${fmtDateTime(firstResponseAt)}`}>
          {compact ? "" : "Replied in "}
          {fmtMinutes(minutes)}
          {late ? " (late)" : ""}
        </span>
      );
    }
    return <span className={cn("text-xs text-ink-400", className)}>—</span>;
  }

  if (!slaDueAt) return <span className={cn("text-xs text-ink-400", className)}>No SLA</span>;

  const remainingMs = new Date(slaDueAt).getTime() - now;
  const breached = Boolean(slaBreachedAt) || remainingMs < 0;
  const tight = !breached && remainingMs < 10 * 60_000;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold tnum",
        breached
          ? "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
          : tight
            ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
            : "bg-ink-100 text-ink-700",
        className,
      )}
      title={`Due ${fmtDateTime(slaDueAt)} ${CONSOLE_TZ_LABEL}`}
      role={breached ? "alert" : undefined}
    >
      {breached ? `Breached ${relative(slaDueAt, now)}` : `${fmtMinutes(remainingMs / 60_000)} left`}
    </span>
  );
}

export function RelativeTime({ iso, serverNow, className }: { iso: string; serverNow: number; className?: string }) {
  const now = useClock(serverNow, 60_000);
  return (
    <time dateTime={iso} title={`${fmtDateTime(iso)} ${CONSOLE_TZ_LABEL}`} className={cn("whitespace-nowrap tnum", className)}>
      {relative(iso, now)}
    </time>
  );
}

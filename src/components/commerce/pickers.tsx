"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Minus, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { track } from "@/lib/analytics";
import type { ActivityStatus, PaxCount } from "@/lib/types";
import { addDays, cn, formatDateKey, paxLabel, paxTotal, parseDateKey, toDateKey } from "@/lib/utils";

/**
 * Date, time and guest selection.
 *
 * All three are bottom sheets on mobile (thumb-reachable, PRD §6) and inline
 * popovers on desktop. Availability is passed in rather than fetched here, so
 * the same components work on the ADP (live supplier availability), in search
 * (no availability) and in booking modification (supplier-constrained).
 */

/* ---------------------------------------------------------------------------
 * Date strip — the fast path. Seven tappable days, no calendar needed.
 * ------------------------------------------------------------------------ */

export function DateStrip({
  value,
  onChange,
  statusFor,
  days = 10,
  from,
  className,
}: {
  value: string;
  onChange: (date: string) => void;
  statusFor?: (date: string) => ActivityStatus;
  days?: number;
  from?: string;
  className?: string;
}) {
  const start = from ?? toDateKey(new Date());
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(start, i)),
    [start, days],
  );

  return (
    <div className={cn("rail -mx-1 px-1", className)} role="group" aria-label="Choose a date">
      {dates.map((d, i) => {
        const status = statusFor?.(d) ?? "available";
        const selected = d === value;
        const soldOut = status === "sold_out";
        const date = parseDateKey(d);
        return (
          <button
            key={d}
            type="button"
            disabled={soldOut}
            onClick={() => {
              onChange(d);
              track("date_selected", { selected_date: d });
            }}
            aria-pressed={selected}
            className={cn(
              "rail-item flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-[var(--radius-control)] border px-3 py-2.5 text-center transition-colors",
              selected
                ? "border-ink-900 bg-ink-900 text-white"
                : soldOut
                  ? "cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400"
                  : "border-ink-200 bg-paper text-ink-800 hover:border-ink-500",
            )}
          >
            <span className="text-2xs font-semibold uppercase tracking-wide">
              {i === 0 ? "Today" : i === 1 ? "Tmrw" : date.toLocaleDateString("en-IN", { weekday: "short" })}
            </span>
            <span className="font-display text-lg font-bold leading-none tnum">{date.getDate()}</span>
            <span className="text-2xs">{date.toLocaleDateString("en-IN", { month: "short" })}</span>
            {status === "limited" && !selected && (
              <span className="text-2xs font-bold text-[var(--color-warning)]">Few left</span>
            )}
            {soldOut && <span className="text-2xs font-bold">Sold out</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Full calendar — for dates beyond the strip
 * ------------------------------------------------------------------------ */

export function DatePickerSheet({
  open,
  onClose,
  value,
  onChange,
  statusFor,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (date: string) => void;
  statusFor?: (date: string) => ActivityStatus;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = parseDateKey(value);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const today = toDateKey(new Date());
  const monthLabel = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  return (
    <Sheet open={open} onClose={onClose} title="Choose your date" description="Live availability from the operator.">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-100"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="font-display font-bold">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-100"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-1 text-2xs font-bold uppercase text-ink-400">
            {d}
          </div>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = toDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1));
          const past = key < today;
          const status = statusFor?.(key) ?? "available";
          const disabled = past || status === "sold_out";
          const selected = key === value;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(key);
                track("date_selected", { selected_date: key });
                onClose();
              }}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-semibold tnum transition-colors",
                selected
                  ? "bg-ink-900 text-white"
                  : disabled
                    ? "cursor-not-allowed text-ink-300"
                    : "text-ink-800 hover:bg-shell",
              )}
            >
              {i + 1}
              {status === "limited" && !disabled && !selected && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-[var(--color-warning)]" />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 flex items-center gap-3 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" /> Few spots left
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-300" /> Sold out
        </span>
      </p>
    </Sheet>
  );
}

export function DateField({
  value,
  onClick,
  label = "Date",
  className,
}: {
  value: string;
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-13 w-full items-center gap-3 rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3.5 text-left transition-colors hover:border-ink-500",
        className,
      )}
    >
      <CalendarDays className="h-5 w-5 shrink-0 text-sun-500" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-2xs font-bold uppercase tracking-wide text-ink-400">{label}</span>
        <span className="block truncate text-sm font-bold text-ink-900">{formatDateKey(value)}</span>
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Guests
 * ------------------------------------------------------------------------ */

const PAX_ROWS: { key: keyof PaxCount; label: string; hint: string; min: number }[] = [
  { key: "adult", label: "Adults", hint: "Age 12+", min: 1 },
  { key: "child", label: "Children", hint: "Age 3–11", min: 0 },
  { key: "infant", label: "Infants", hint: "Under 3 · usually free", min: 0 },
  { key: "senior", label: "Seniors", hint: "Age 60+ · reduced rate on many activities", min: 0 },
];

export function GuestSelector({
  value,
  onChange,
  max = 20,
  className,
}: {
  value: PaxCount;
  onChange: (pax: PaxCount) => void;
  max?: number;
  className?: string;
}) {
  const total = paxTotal(value);

  const set = (key: keyof PaxCount, next: number) => {
    const updated = { ...value, [key]: next };
    onChange(updated);
    track("guest_count_changed", {
      guest_count: paxTotal(updated),
      pax_breakdown: paxLabel(updated),
    });
  };

  return (
    <div className={cn("space-y-1", className)}>
      {PAX_ROWS.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4 py-2.5">
          <div>
            <p className="text-[0.95rem] font-bold text-ink-900">{row.label}</p>
            <p className="text-xs text-ink-500">{row.hint}</p>
          </div>
          <div className="flex items-center gap-1">
            <Stepper
              label={`Decrease ${row.label}`}
              disabled={value[row.key] <= row.min}
              onClick={() => set(row.key, value[row.key] - 1)}
            >
              <Minus className="h-4 w-4" />
            </Stepper>
            <span className="w-8 text-center font-display text-lg font-bold tnum" aria-live="polite">
              {value[row.key]}
            </span>
            <Stepper
              label={`Increase ${row.label}`}
              disabled={total >= max}
              onClick={() => set(row.key, value[row.key] + 1)}
            >
              <Plus className="h-4 w-4" />
            </Stepper>
          </div>
        </div>
      ))}

      {total >= 5 && (
        <p className="mt-2 rounded-[var(--radius-control)] bg-sun-50 p-3 text-xs leading-relaxed text-sun-800">
          <strong className="font-bold">Booking for {total}?</strong> A private vehicle usually costs
          less than two shared cars and keeps everyone together. We can also price the whole group on
          WhatsApp.
        </p>
      )}
    </div>
  );
}

function Stepper({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-300 text-ink-800 transition-colors hover:border-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GuestField({
  value,
  onClick,
  className,
}: {
  value: PaxCount;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-13 w-full items-center gap-3 rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3.5 text-left transition-colors hover:border-ink-500",
        className,
      )}
    >
      <Users className="h-5 w-5 shrink-0 text-sun-500" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-2xs font-bold uppercase tracking-wide text-ink-400">Guests</span>
        <span className="block truncate text-sm font-bold text-ink-900">{paxLabel(value)}</span>
      </span>
    </button>
  );
}

export function GuestSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: PaxCount;
  onChange: (pax: PaxCount) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Who's coming?"
      description="Child and senior rates are applied automatically."
      footer={
        <Button block onClick={onClose}>
          Done · {paxLabel(value)}
        </Button>
      }
    >
      <GuestSelector value={value} onChange={onChange} />
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
 * Time slots
 * ------------------------------------------------------------------------ */

export function TimeSlots({
  slots,
  value,
  onChange,
  className,
}: {
  slots: { time: string; status: ActivityStatus | string; spotsLeft?: number }[];
  value?: string;
  onChange: (time: string) => void;
  className?: string;
}) {
  if (!slots.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label="Choose a time">
      {slots.map((slot) => {
        const soldOut = slot.status === "sold_out";
        const selected = slot.time === value;
        return (
          <button
            key={slot.time}
            type="button"
            disabled={soldOut}
            aria-pressed={selected}
            onClick={() => {
              onChange(slot.time);
              track("time_selected", { selected_time: slot.time });
            }}
            className={cn(
              "rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
              selected
                ? "border-ink-900 bg-ink-900 text-white"
                : soldOut
                  ? "cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400 line-through"
                  : "border-ink-300 bg-paper text-ink-800 hover:border-ink-900",
            )}
          >
            {slot.time}
            {slot.status === "limited" && !selected && (
              <span className="ml-1.5 text-2xs font-bold text-[var(--color-warning)]">
                {slot.spotsLeft} left
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

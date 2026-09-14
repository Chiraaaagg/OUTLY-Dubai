import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Currency, Money, PaxCount } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ----------------------------------------------------------------------------
 * Money
 * ------------------------------------------------------------------------- */

export function formatMoney(value: number, currency: Currency): string {
  if (currency === "AED") {
    return `AED ${value.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
  }
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function pick(money: Money, currency: Currency): number {
  return currency === "AED" ? money.aed : money.inr;
}

export function priceIn(money: Money, currency: Currency): string {
  return formatMoney(pick(money, currency), currency);
}

export function addMoney(a: Money, b: Money): Money {
  return { inr: a.inr + b.inr, aed: a.aed + b.aed };
}

export function scaleMoney(a: Money, n: number): Money {
  return { inr: Math.round(a.inr * n), aed: Math.round(a.aed * n) };
}

export const ZERO: Money = { inr: 0, aed: 0 };

export function savingsPercent(price: Money, compareAt?: Money): number | null {
  if (!compareAt || compareAt.inr <= price.inr) return null;
  return Math.round(((compareAt.inr - price.inr) / compareAt.inr) * 100);
}

/* ----------------------------------------------------------------------------
 * Pax
 * ------------------------------------------------------------------------- */

export const EMPTY_PAX: PaxCount = { adult: 2, child: 0, infant: 0, senior: 0 };

export function paxTotal(pax: PaxCount): number {
  return pax.adult + pax.child + pax.infant + pax.senior;
}

export function paxBillable(pax: PaxCount): number {
  // Infants are free on every OUTLY SKU; they still occupy a seat count.
  return pax.adult + pax.child + pax.senior;
}

export function paxLabel(pax: PaxCount): string {
  const parts: string[] = [];
  if (pax.adult) parts.push(`${pax.adult} adult${pax.adult > 1 ? "s" : ""}`);
  if (pax.child) parts.push(`${pax.child} child${pax.child > 1 ? "ren" : ""}`);
  if (pax.senior) parts.push(`${pax.senior} senior${pax.senior > 1 ? "s" : ""}`);
  if (pax.infant) parts.push(`${pax.infant} infant${pax.infant > 1 ? "s" : ""}`);
  return parts.length ? parts.join(", ") : "No guests selected";
}

/* ----------------------------------------------------------------------------
 * Time & dates — all deterministic so SSR and client agree (no hydration drift)
 * ------------------------------------------------------------------------- */

export function formatDuration(minutes: number): string {
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${m} min`;
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function formatDateKey(key: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseDateKey(key);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...opts,
  });
}

export function formatDateLong(key: string): string {
  return parseDateKey(key).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ----------------------------------------------------------------------------
 * Deterministic pseudo-randomness.
 * Availability, "X booked this month" style numbers and mock latency all derive
 * from a hash of stable inputs — never Math.random — so the server and the
 * client render identical markup and no fake scarcity can drift between views.
 * ------------------------------------------------------------------------- */

export function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function seeded(input: string, max: number): number {
  return hash(input) % max;
}

/* ----------------------------------------------------------------------------
 * Misc
 * ------------------------------------------------------------------------- */

export function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function pluralise(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function bookingReference(seed: string): string {
  const n = seeded(seed, 900000) + 100000;
  return `OUT-${n}`;
}

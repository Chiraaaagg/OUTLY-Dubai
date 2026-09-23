import type { Agent, CartItem, InquiryItem, Money } from "./types";
import { seeded } from "./utils";

/**
 * Inquiry domain helpers (pivot plan §3.9, §6.2, §7.3).
 *
 * The three things that live here are the three things the confirmation page
 * and the WhatsApp auto-ack both need to agree on: the reference, the
 * business-hours-adjusted deadline, and the assigned agent. In production all
 * three are computed server-side inside POST /inquiries; these are the client
 * mirrors so the UI can render the same values before the response lands.
 */

/* ---------------------------------------------------------------------------
 * SLA — a concrete timestamp, never a duration (pivot §3.9 rule 1)
 * ------------------------------------------------------------------------ */

/**
 * Admin-editable in production (`settings.sla.*`); this is the client mirror.
 * The values come from NEXT_PUBLIC_SLA_* so the storefront preview, the server
 * value and the published opening hours cannot drift apart — hard-coding them
 * here is how the site ended up promising a 30-minute reply at 10pm on a
 * Sunday.
 */
function num(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function days(raw: string | undefined): number[] {
  const parsed = [...new Set((raw ?? "").split(",").map((d) => Number.parseInt(d.trim(), 10)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return parsed.length ? parsed : [1, 2, 3, 4, 5, 6];
}

export const SLA = {
  responseMinutes: num(process.env.NEXT_PUBLIC_SLA_RESPONSE_MINUTES, 30),
  businessStart: process.env.NEXT_PUBLIC_SLA_BUSINESS_START ?? "10:00",
  businessEnd: process.env.NEXT_PUBLIC_SLA_BUSINESS_END ?? "18:00",
  /** 0 = Sunday … 6 = Saturday. */
  businessDays: days(process.env.NEXT_PUBLIC_SLA_BUSINESS_DAYS),
  timeZone: process.env.NEXT_PUBLIC_SLA_TIMEZONE ?? "Asia/Dubai",
} as const;

/** "IST" / "GST" / the raw IANA name. Kept identical to the server helper. */
export const SLA_TZ_LABEL =
  SLA.timeZone === "Asia/Kolkata" ? "IST" : SLA.timeZone === "Asia/Dubai" ? "GST" : SLA.timeZone;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hhmm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function zoned(d: Date): { minutesOfDay: number; dayKey: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SLA.timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "0";
  const weekday = WEEKDAYS.indexOf(get("weekday").slice(0, 3));
  return {
    minutesOfDay: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekday < 0 ? 0 : weekday,
  };
}

export function isWithinBusinessHours(at: Date = new Date()): boolean {
  const { minutesOfDay, weekday } = zoned(at);
  if (!SLA.businessDays.includes(weekday)) return false;
  return minutesOfDay >= hhmm(SLA.businessStart) && minutesOfDay < hhmm(SLA.businessEnd);
}

/**
 * Deadline = submission + SLA, pushed to the next business-hours window when
 * submitted out of hours or on a day the team does not work (pivot §3.9
 * rule 2: the promise visibly adapts).
 */
export function computeSlaDueAt(submittedAt: Date = new Date()): Date {
  const open = hhmm(SLA.businessStart);
  const close = hhmm(SLA.businessEnd);
  const here = zoned(submittedAt);

  if (SLA.businessDays.includes(here.weekday) && here.minutesOfDay >= open && here.minutesOfDay < close) {
    const due = new Date(submittedAt.getTime() + SLA.responseMinutes * 60_000);
    const after = zoned(due);
    if (after.minutesOfDay >= close || after.dayKey !== here.dayKey) {
      const overshoot = after.dayKey !== here.dayKey ? after.minutesOfDay + (24 * 60 - close) : after.minutesOfDay - close;
      due.setTime(due.getTime() - overshoot * 60_000);
    }
    return due;
  }

  const startsToday = SLA.businessDays.includes(here.weekday) && here.minutesOfDay < open;
  let minutesAhead = startsToday ? open - here.minutesOfDay : 24 * 60 - here.minutesOfDay + open;
  for (let step = startsToday ? 0 : 1; step < 8; step++) {
    const candidate = new Date(submittedAt.getTime() + minutesAhead * 60_000);
    if (SLA.businessDays.includes(zoned(candidate).weekday)) {
      return new Date(candidate.getTime() + SLA.responseMinutes * 60_000);
    }
    minutesAhead += 24 * 60;
  }
  return new Date(submittedAt.getTime() + SLA.responseMinutes * 60_000);
}

export function formatDeadline(due: Date, now: Date = new Date()): string {
  const time = due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: SLA.timeZone });
  const dayNow = zoned(now).dayKey;
  const dayDue = zoned(due).dayKey;
  if (dayDue === dayNow) return `${time} ${SLA_TZ_LABEL}`;
  const tomorrow = zoned(new Date(now.getTime() + 24 * 3600_000)).dayKey;
  if (dayDue === tomorrow) return `${time} ${SLA_TZ_LABEL} tomorrow`;
  const date = due.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: SLA.timeZone });
  return `${time} ${SLA_TZ_LABEL} on ${date}`;
}

/* ---------------------------------------------------------------------------
 * Agents (MOCK) — named humans are the trust element an OTA cannot copy
 * ------------------------------------------------------------------------ */

export const agents: Agent[] = [
  { id: "ag-01", name: "Jyoti Menon", initials: "JM", role: "Dubai trip specialist", languages: ["English", "Hindi", "Malayalam"], shift: "IST" },
  { id: "ag-02", name: "Farhan Ali", initials: "FA", role: "Dubai trip specialist", languages: ["English", "Hindi", "Urdu"], shift: "GST" },
  { id: "ag-03", name: "Priya Shah", initials: "PS", role: "Family & group specialist", languages: ["English", "Hindi", "Gujarati"], shift: "IST" },
  { id: "ag-04", name: "Rohan Iyer", initials: "RI", role: "Premium & private experiences", languages: ["English", "Hindi", "Tamil"], shift: "GST" },
];

/**
 * Routing mirror of pivot §7.3: Tier D / high value → premium specialist,
 * groups of 5+ → family specialist, otherwise shift-aware round robin.
 */
export function assignAgent(opts: { totalINR: number; guests: number; seed: string }): Agent {
  if (opts.totalINR >= 100000) return agents[3];
  if (opts.guests >= 5) return agents[2];
  const pool = agents.filter((a) => (isWithinBusinessHours() ? true : a.shift === "GST"));
  return pool[seeded(opts.seed, pool.length)] ?? agents[0];
}

/* ---------------------------------------------------------------------------
 * Reference + items
 * ------------------------------------------------------------------------ */

export function inquiryReference(seed: string): string {
  return `INQ-${seeded(seed, 900000) + 100000}`;
}

/**
 * Cart → inquiry items is a field copy (pivot §6.2, §8.1 item 3). `unit`/`total`
 * become `indicative*`; nothing else changes shape. The reverse copy — won
 * inquiry → order — is the same operation with `confirmedTotal` winning.
 */
export function inquiryItemsFromCart(cart: CartItem[]): InquiryItem[] {
  return cart.map(({ unit, total, ...rest }) => ({
    ...rest,
    indicativeUnit: unit,
    indicativeTotal: total,
  }));
}

export function sumIndicative(items: InquiryItem[]): Money {
  return items.reduce(
    (sum, i) => ({ inr: sum.inr + i.indicativeTotal.inr, aed: sum.aed + i.indicativeTotal.aed }),
    { inr: 0, aed: 0 },
  );
}

export const BUDGET_BANDS: { id: NonNullable<import("./types").BudgetBand>; label: string }[] = [
  { id: "under_25k", label: "Under ₹25,000" },
  { id: "25k_60k", label: "₹25,000 – ₹60,000" },
  { id: "60k_150k", label: "₹60,000 – ₹1,50,000" },
  { id: "150k_plus", label: "₹1,50,000+" },
  { id: "unsure", label: "Not sure yet" },
];

/** The one sentence every inquiry-mode CTA traces back to (pivot §3.1). */
export const CONFIRM_FIRST =
  "We confirm with the operator before you pay — so you never get a voucher that fails at the gate.";

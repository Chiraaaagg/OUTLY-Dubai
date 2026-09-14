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

/** Admin-editable in production (`settings.sla.*`). Hard-coded mirror here. */
export const SLA = {
  responseMinutes: 30,
  /** 9am–11pm IST with UAE-shift extension covering the same window in GST. */
  businessStartHourIST: 9,
  businessEndHourIST: 23,
  timeZone: "Asia/Kolkata",
} as const;

function toIST(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: SLA.timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

export function isWithinBusinessHours(at: Date = new Date()): boolean {
  const { hour } = toIST(at);
  return hour >= SLA.businessStartHourIST && hour < SLA.businessEndHourIST;
}

/**
 * Deadline = submission + SLA, pushed to the next business-hours window when
 * submitted out of hours (pivot §3.9 rule 2: the promise visibly adapts).
 */
export function computeSlaDueAt(submittedAt: Date = new Date()): Date {
  const { hour, minute } = toIST(submittedAt);
  const due = new Date(submittedAt);

  if (hour >= SLA.businessStartHourIST && hour < SLA.businessEndHourIST) {
    due.setMinutes(due.getMinutes() + SLA.responseMinutes);
    // If the SLA window crosses closing time, the reply lands at closing.
    const after = toIST(due);
    if (after.hour >= SLA.businessEndHourIST) {
      due.setMinutes(due.getMinutes() - ((after.hour - SLA.businessEndHourIST) * 60 + after.minute));
    }
    return due;
  }

  // Out of hours: next opening + SLA. Minutes into the current IST day that
  // remain until opening (either later today or tomorrow).
  const minutesNow = hour * 60 + minute;
  const openMinutes = SLA.businessStartHourIST * 60;
  const untilOpen =
    hour < SLA.businessStartHourIST ? openMinutes - minutesNow : 24 * 60 - minutesNow + openMinutes;
  due.setMinutes(due.getMinutes() + untilOpen + SLA.responseMinutes);
  return due;
}

export function formatDeadline(due: Date, now: Date = new Date()): string {
  const time = due.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: SLA.timeZone,
  });
  const sameDay =
    due.toLocaleDateString("en-IN", { timeZone: SLA.timeZone }) ===
    now.toLocaleDateString("en-IN", { timeZone: SLA.timeZone });
  return sameDay ? `${time} IST` : `${time} IST tomorrow`;
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

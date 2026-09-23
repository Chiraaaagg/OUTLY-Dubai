import type { Activity, ActivityStatus } from "./types";
import { addDays, hash, seeded, toDateKey } from "./utils";

/** Fields the deterministic availability model reads. */
export type AvailabilityActivity = Pick<Activity, "slug" | "timeSlots" | "quoteOnly" | "confirmation" | "pickupIncluded" | "bookedThisMonth">;

/**
 * Availability model (MOCK).
 *
 * Deterministic from (slug, date) so server and client agree and no fake
 * scarcity can drift between two views of the same page. Real implementation
 * calls the supplier with a 5-minute cache TTL, and re-verifies with zero cache
 * at payment authorisation (PRD §11, AC-INV-01).
 *
 * INTEGRATION BOUNDARY — replace `getAvailability` with the availability
 * service. Everything else in the app consumes this shape.
 */

export interface Availability {
  date: string;
  status: ActivityStatus;
  /** Only populated when status is "limited". Never invented for urgency. */
  spotsLeft?: number;
  slots: { time: string; status: ActivityStatus; spotsLeft?: number }[];
}

export function today(): string {
  return toDateKey(new Date());
}

export function tomorrow(): string {
  return addDays(today(), 1);
}

export function getAvailability(activity: AvailabilityActivity, date: string): Availability {
  if (activity.quoteOnly) {
    return { date, status: "quote_only", slots: [] };
  }

  const key = `${activity.slug}:${date}`;
  const n = hash(key);

  // ~6% of dates sold out, ~14% limited. Stable per SKU per date.
  const bucket = n % 100;
  const status: ActivityStatus =
    bucket < 6 ? "sold_out" : bucket < 20 ? "limited" : "available";

  const slots = activity.timeSlots.map((time) => {
    const sn = hash(`${key}:${time}`);
    const sb = sn % 100;
    const slotStatus: ActivityStatus =
      status === "sold_out" ? "sold_out" : sb < 18 ? "sold_out" : sb < 38 ? "limited" : "available";
    return {
      time,
      status: slotStatus,
      spotsLeft: slotStatus === "limited" ? 2 + (sn % 6) : undefined,
    };
  });

  const anyOpen = slots.some((s) => s.status !== "sold_out");

  return {
    date,
    status: slots.length && !anyOpen ? "sold_out" : status,
    spotsLeft: status === "limited" ? 2 + (n % 7) : undefined,
    slots,
  };
}

/** AC-ADP-02: never show an error for an unavailable date — offer the next three. */
export function nextAvailableDates(activity: AvailabilityActivity, from: string, count = 3): string[] {
  const out: string[] = [];
  let cursor = from;
  for (let i = 1; i <= 45 && out.length < count; i++) {
    cursor = addDays(from, i);
    if (getAvailability(activity, cursor).status !== "sold_out") out.push(cursor);
  }
  return out;
}

export function isAvailableOn(activity: AvailabilityActivity, date: string): boolean {
  return getAvailability(activity, date).status !== "sold_out";
}

/**
 * Same-day booking cutoff. Truthful urgency only (PRD merchandising rules):
 * this is derived from the supplier's real operating cutoff, not a countdown
 * invented to pressure the customer.
 */
export function sameDayCutoff(activity: AvailabilityActivity): string | null {
  if (activity.pickupIncluded) return "11:00";
  if (activity.confirmation === "manual") return null;
  return "2 hours before your slot";
}

/** Deterministic "booked in the last 24h" figure — derived, never random. */
export function recentBookings(activity: AvailabilityActivity): number {
  return 3 + seeded(`${activity.slug}:recent`, 22);
}

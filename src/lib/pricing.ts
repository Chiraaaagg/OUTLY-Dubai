import type { Activity, AddOn, CartItem, Money, PaxCount, Variant } from "./types";
import { ZERO, addMoney, scaleMoney } from "./utils";

/** The fields pricing reads — a full `Activity` or the card projection both satisfy it. */
export type PricedActivity = Pick<Activity, "slug" | "title" | "images" | "price" | "variants" | "addOns" | "quoteOnly" | "confirmation" | "fulfilmentMode" | "freeCancellationHours" | "durationMinutes">;

/**
 * Price computation.
 *
 * The single rule this file exists to enforce: the number shown on the activity
 * page for a given date and pax equals the number charged at checkout
 * (AC-ADP-05, AC-CO-02). Taxes and booking fees are already inside the SKU
 * price, so there is no place here to add one.
 */

export interface PriceBreakdownLine {
  label: string;
  detail?: string;
  amount: Money;
  kind: "base" | "addon" | "discount" | "total";
}

export interface PriceBreakdown {
  lines: PriceBreakdownLine[];
  subtotal: Money;
  discount: Money;
  total: Money;
  perPersonFrom: Money;
  savings?: Money;
}

export function variantById(activity: PricedActivity, id?: string): Variant | undefined {
  if (!id) return activity.variants.find((v) => v.recommended) ?? activity.variants[0];
  return activity.variants.find((v) => v.id === id);
}

function unitFor(activity: PricedActivity, variant: Variant | undefined, type: keyof PaxCount): Money {
  const band = activity.price;
  const base =
    type === "adult"
      ? band.adult
      : type === "child"
        ? (band.child ?? band.adult)
        : type === "senior"
          ? (band.senior ?? band.adult)
          : (band.infant ?? ZERO);
  if (!variant || type === "infant") return base;
  return addMoney(base, variant.delta);
}

export function computeBreakdown(
  activity: PricedActivity,
  pax: PaxCount,
  variantId?: string,
  addOnIds: string[] = [],
): PriceBreakdown {
  const variant = variantById(activity, variantId);
  const lines: PriceBreakdownLine[] = [];
  let subtotal = ZERO;

  (["adult", "child", "senior", "infant"] as const).forEach((type) => {
    const count = pax[type];
    if (!count) return;
    const unit = unitFor(activity, variant, type);
    const amount = scaleMoney(unit, count);
    if (type === "infant" && unit.inr === 0) {
      lines.push({
        label: `Infants × ${count}`,
        detail: "Free on this experience",
        amount: ZERO,
        kind: "base",
      });
      return;
    }
    lines.push({
      label: `${type[0].toUpperCase()}${type.slice(1)}s × ${count}`,
      detail: `₹${unit.inr.toLocaleString("en-IN")} each, all-in`,
      amount,
      kind: "base",
    });
    subtotal = addMoney(subtotal, amount);
  });

  const billable = pax.adult + pax.child + pax.senior;
  activity.addOns
    .filter((a) => addOnIds.includes(a.id))
    .forEach((addOn) => {
      const amount = addOn.perPerson ? scaleMoney(addOn.price, billable) : addOn.price;
      lines.push({
        label: addOn.name,
        detail: addOn.price.inr === 0 ? "No extra charge" : addOn.perPerson ? "Per person" : "Per booking",
        amount,
        kind: "addon",
      });
      subtotal = addMoney(subtotal, amount);
    });

  const compare = activity.price.compareAt;
  const savings =
    compare && compare.inr > activity.price.adult.inr
      ? scaleMoney(
          { inr: compare.inr - activity.price.adult.inr, aed: compare.aed - activity.price.adult.aed },
          billable,
        )
      : undefined;

  return {
    lines,
    subtotal,
    discount: ZERO,
    total: subtotal,
    perPersonFrom: unitFor(activity, variant, "adult"),
    savings,
  };
}

export function toCartItem(
  activity: PricedActivity,
  opts: { date: string; time: string; pax: PaxCount; variantId?: string; addOnIds?: string[] },
): CartItem {
  const variant = variantById(activity, opts.variantId);
  const breakdown = computeBreakdown(activity, opts.pax, opts.variantId, opts.addOnIds ?? []);
  return {
    id: `${activity.slug}-${opts.date}-${opts.time}-${variant?.id ?? "std"}`,
    kind: "activity",
    slug: activity.slug,
    title: activity.title,
    image: activity.images[0],
    date: opts.date,
    time: opts.time,
    variantId: variant?.id,
    variantName: variant?.name,
    pax: opts.pax,
    addOnIds: opts.addOnIds ?? [],
    unit: breakdown.perPersonFrom,
    total: breakdown.total,
    confirmation: activity.confirmation,
    fulfilmentMode: activity.fulfilmentMode,
    freeCancellationHours: activity.freeCancellationHours,
    durationMinutes: activity.durationMinutes,
  };
}

/**
 * Mixed-cart rule (pivot §8.2 step 6): a cart containing any inquiry-mode item
 * routes to the inquiry flow. Simplest correct rule; protects the margin SKUs.
 */
export function cartRequiresInquiry(items: CartItem[]): boolean {
  return items.length === 0 || items.some((i) => i.fulfilmentMode !== "instant");
}

/* ---------------------------------------------------------------------------
 * Coupons (MOCK). The margin guardrail in PRD §13 lives server-side; this is
 * only the client-visible validation surface.
 * ------------------------------------------------------------------------ */

export interface Coupon {
  code: string;
  label: string;
  kind: "percent" | "fixed";
  value: number;
  minOrderINR: number;
  firstBookingOnly?: boolean;
  note: string;
}

export const coupons: Coupon[] = [
  {
    code: "FIRSTTRIP",
    label: "10% off your first booking",
    kind: "percent",
    value: 10,
    minOrderINR: 3000,
    firstBookingOnly: true,
    note: "Capped at ₹2,000 off.",
  },
  {
    code: "DESERT500",
    label: "₹500 off desert safaris",
    kind: "fixed",
    value: 500,
    minOrderINR: 4000,
    note: "Valid on desert safari bookings above ₹4,000.",
  },
  {
    code: "FAMILY7",
    label: "₹1,500 off bookings above ₹25,000",
    kind: "fixed",
    value: 1500,
    minOrderINR: 25000,
    note: "Built for family group bookings.",
  },
];

export type CouponResult =
  | { ok: true; coupon: Coupon; discount: Money; message: string }
  | { ok: false; message: string };

export function applyCoupon(code: string, subtotal: Money): CouponResult {
  const coupon = coupons.find((c) => c.code.toLowerCase() === code.trim().toLowerCase());
  if (!coupon) {
    return { ok: false, message: "We don't recognise that code. Check the spelling, or ask us on WhatsApp." };
  }
  if (subtotal.inr < coupon.minOrderINR) {
    const short = coupon.minOrderINR - subtotal.inr;
    return {
      ok: false,
      message: `${coupon.code} needs a minimum order of ₹${coupon.minOrderINR.toLocaleString("en-IN")}. You're ₹${short.toLocaleString("en-IN")} short.`,
    };
  }
  const inr =
    coupon.kind === "percent"
      ? Math.min(Math.round((subtotal.inr * coupon.value) / 100), 2000)
      : coupon.value;
  const aed = Math.round(inr / 23.2);
  return {
    ok: true,
    coupon,
    discount: { inr, aed },
    message: `${coupon.code} applied — ₹${inr.toLocaleString("en-IN")} off.`,
  };
}

/** Deposit option: 30% now, balance at T-7 on orders above ₹25,000 (PRD §5.6). */
export const DEPOSIT_THRESHOLD_INR = 25000;
export const EMI_THRESHOLD_INR = 15000;

export function depositSplit(total: Money): { now: Money; later: Money } {
  return {
    now: { inr: Math.round(total.inr * 0.3), aed: Math.round(total.aed * 0.3) },
    later: { inr: Math.round(total.inr * 0.7), aed: Math.round(total.aed * 0.7) },
  };
}

/** Price lock — 20 minutes from cart entry (PRD §3.3, §12). */
export const PRICE_LOCK_MINUTES = 20;

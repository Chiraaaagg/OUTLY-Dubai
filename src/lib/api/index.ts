import { getAvailability, nextAvailableDates } from "../availability";
import { activities, activityBySlug } from "../data/activities";
import { bookingByReference } from "../data/bookings";
import { computeBreakdown } from "../pricing";
import { searchActivities } from "../search";
import { inquiryByReference } from "../data/inquiries";
import { assignAgent, computeSlaDueAt, inquiryReference, isWithinBusinessHours } from "../inquiry";
import type {
  Activity,
  Agent,
  Booking,
  BudgetBand,
  CartItem,
  Dietary,
  Inquiry,
  InquirySource,
  OrderStatus,
  PaxCount,
  Rail,
  SearchFilters,
  SearchResult,
  Traveller,
} from "../types";
import { bookingReference } from "../utils";
import { ApiError, currentScenario, mockCall, type MockScenario } from "./client";

/* ---------------------------------------------------------------------------
 * Catalogue
 * ------------------------------------------------------------------------ */

export async function fetchSearch(filters: SearchFilters): Promise<SearchResult> {
  return mockCall(
    () => {
      if (currentScenario() === "empty") {
        return { activities: [], total: 0, appliedFilters: filters };
      }
      return searchActivities(filters);
    },
    { latencyMs: 380, failsOn: ["error", "timeout", "offline"] },
  );
}

export async function fetchRecommendations(slug: string, limit = 4): Promise<Activity[]> {
  return mockCall(
    () => {
      const a = activityBySlug(slug);
      if (!a) return [];
      const related = a.relatedSlugs
        .map(activityBySlug)
        .filter((x): x is Activity => Boolean(x));
      if (related.length >= limit) return related.slice(0, limit);
      const fill = activities
        .filter((x) => x.slug !== slug && x.categorySlug === a.categorySlug)
        .slice(0, limit - related.length);
      return [...related, ...fill];
    },
    { latencyMs: 300, failsOn: ["error", "offline"] },
  );
}

/* ---------------------------------------------------------------------------
 * Availability & price — re-verified before payment (AC-INV-01)
 * ------------------------------------------------------------------------ */

export interface AvailabilityResponse {
  status: "available" | "limited" | "sold_out" | "quote_only";
  spotsLeft?: number;
  slots: { time: string; status: string; spotsLeft?: number }[];
  nextDates: string[];
  checkedAt: string;
}

export async function checkAvailability(
  slug: string,
  date: string,
): Promise<AvailabilityResponse> {
  return mockCall(
    () => {
      const activity = activityBySlug(slug);
      if (!activity) throw new ApiError("Unknown activity", "error", "Try searching again.");
      const scenario = currentScenario();
      const av = getAvailability(activity, date);
      const status = scenario === "sold_out" ? "sold_out" : av.status;
      return {
        status: status as AvailabilityResponse["status"],
        spotsLeft: av.spotsLeft,
        slots: scenario === "sold_out" ? [] : av.slots,
        nextDates: nextAvailableDates(activity, date),
        checkedAt: new Date().toISOString(),
      };
    },
    { latencyMs: 620, failsOn: ["error", "timeout", "offline"] },
  );
}

export interface PriceCheckResponse {
  changed: boolean;
  oldTotalINR?: number;
  newTotalINR: number;
  reason?: string;
}

/** AC-CO-04: a price change must be shown and explicitly re-consented to. */
export async function reverifyPrice(items: CartItem[]): Promise<PriceCheckResponse> {
  return mockCall(
    () => {
      const total = items.reduce((sum, i) => sum + i.total.inr, 0);
      if (currentScenario() === "price_changed") {
        const bumped = Math.round(total * 1.06);
        return {
          changed: true,
          oldTotalINR: total,
          newTotalINR: bumped,
          reason:
            "The operator raised the rate for this date since you added it. You have not been charged — confirm the new price to continue, or cancel and nothing happens.",
        };
      }
      return { changed: false, newTotalINR: total };
    },
    { latencyMs: 500, failsOn: ["error", "offline"] },
  );
}

/* ---------------------------------------------------------------------------
 * Orders & payment
 * ------------------------------------------------------------------------ */

export interface CreateOrderInput {
  items: CartItem[];
  traveller: Traveller;
  paymentMethod: string;
  couponCode?: string;
  rail: Rail;
  currency: "INR" | "AED";
  totalINR: number;
  totalAED: number;
  discountINR?: number;
}

export interface OrderResult {
  reference: string;
  status: OrderStatus;
  voucherEtaMinutes: number;
}

/**
 * Order state is webhook-driven in production (AC-PAY-01) — the client never
 * decides that a payment succeeded. This mock returns the state the server
 * would have written by the time the redirect lands.
 */
export async function submitOrder(input: CreateOrderInput): Promise<OrderResult> {
  const scenario = currentScenario();
  return mockCall(
    () => {
      const reference = bookingReference(
        `${input.traveller.phone}:${input.items.map((i) => i.id).join("|")}`,
      );
      const manual = input.items.some((i) => i.confirmation === "manual");
      const status: OrderStatus =
        scenario === "supplier_pending" || manual ? "supplier_pending" : "confirmed";
      return {
        reference,
        status,
        voucherEtaMinutes: status === "supplier_pending" ? 120 : 1,
      };
    },
    {
      latencyMs: 1500,
      failsOn: ["payment_failed", "payment_timeout", "error", "offline"],
      scenario,
    },
  );
}

export async function fetchBooking(reference: string): Promise<Booking> {
  return mockCall(
    () => {
      const b = bookingByReference(reference);
      if (!b) {
        throw new ApiError(
          "Booking not found",
          "error",
          "Check the reference and the phone number you booked with. If it still doesn't work, message us on WhatsApp with the reference.",
          false,
        );
      }
      return b;
    },
    { latencyMs: 450, failsOn: ["error", "offline", "timeout"] },
  );
}

export interface CancellationQuote {
  refundINR: number;
  feeINR: number;
  refundPercent: number;
  creditedInDays: string;
  freeUntil: string;
  explanation: string;
}

/** AC-BM-01: the exact refund and its timing are shown before confirming. */
export async function quoteCancellation(booking: Booking): Promise<CancellationQuote> {
  return mockCall(
    () => {
      const hours = booking.items[0]?.freeCancellationHours ?? 24;
      const free = true; // MOCK: all demo bookings are within their free window
      const refundINR = free ? booking.total.inr : Math.round(booking.total.inr * 0.5);
      return {
        refundINR,
        feeINR: booking.total.inr - refundINR,
        refundPercent: Math.round((refundINR / booking.total.inr) * 100),
        creditedInDays: "5–7 working days",
        freeUntil: `${hours} hours before your start time`,
        explanation: free
          ? "You're inside the free cancellation window, so you get the full amount back."
          : `You're past the ${hours}-hour free window, so the operator retains 50%.`,
      };
    },
    { latencyMs: 600, failsOn: ["error", "offline"] },
  );
}

export async function cancelBooking(reference: string): Promise<{ ok: true; refundINR: number }> {
  const booking = bookingByReference(reference);
  return mockCall(
    () => ({ ok: true as const, refundINR: booking?.total.inr ?? 0 }),
    { latencyMs: 900, failsOn: ["error", "offline"] },
  );
}

export async function resendVoucher(
  reference: string,
  channel: "whatsapp" | "email",
): Promise<{ ok: true; channel: string }> {
  return mockCall(() => ({ ok: true as const, channel }), {
    latencyMs: 700,
    failsOn: ["error", "offline"],
  });
}

export async function submitReview(input: {
  reference: string;
  rating: number;
  body: string;
  dietaryMet?: boolean;
}): Promise<{ ok: true; moderationHours: number }> {
  return mockCall(() => ({ ok: true as const, moderationHours: 24 }), {
    latencyMs: 900,
    failsOn: ["error", "offline"],
  });
}

export async function requestQuote(input: {
  name: string;
  phone: string;
  activity?: string;
  dates?: string;
  guests?: string;
  notes?: string;
}): Promise<{ ok: true; responseHours: number }> {
  return mockCall(() => ({ ok: true as const, responseHours: 2 }), {
    latencyMs: 1100,
    failsOn: ["error", "offline"],
  });
}

/* ---------------------------------------------------------------------------
 * Inquiries — the site's terminal event in inquiry mode (pivot plan §5.2)
 * ------------------------------------------------------------------------ */

export interface SubmitInquiryInput {
  items: CartItem[];
  leadName: string;
  leadPhone: string;
  countryCode: string;
  leadEmail?: string;
  travelDateFrom?: string;
  datesFlexible: boolean;
  pax?: PaxCount;
  hotel?: string;
  dietary?: Dietary;
  specialRequests?: string;
  budgetBand?: BudgetBand;
  currency: "INR" | "AED";
  source: InquirySource;
  whatsappConsent: boolean;
  /** Honeypot + timing check inputs (pivot §9 #1). Server enforces. */
  honeypot?: string;
  startedAt?: number;
}

export interface InquiryResult {
  reference: string;
  slaDueAt: string;
  agent: Agent;
  outOfHours: boolean;
}

/**
 * POST /inquiries. Server-side this validates, rate-limits, snapshots
 * indicative prices, creates inquiry + items, assigns an agent, starts the SLA
 * timer, fires the WhatsApp/email ack and emits `inquiry_submitted` → Meta Lead.
 * The client mirror computes reference, deadline and agent identically so the
 * confirmation page can render before the response lands.
 */
export async function submitInquiry(input: SubmitInquiryInput): Promise<InquiryResult> {
  return mockCall(
    () => {
      if (input.honeypot) {
        throw new ApiError("Rejected", "error", "Something went wrong. Try again.", false);
      }
      const seed = `${input.leadPhone}:${input.items.map((i) => i.id).join("|")}:${Date.now()}`;
      const totalINR = input.items.reduce((s, i) => s + i.total.inr, 0);
      const guests = input.pax
        ? input.pax.adult + input.pax.child + input.pax.infant + input.pax.senior
        : 0;
      const due = computeSlaDueAt();
      return {
        reference: inquiryReference(seed),
        slaDueAt: due.toISOString(),
        agent: assignAgent({ totalINR, guests, seed }),
        outOfHours: !isWithinBusinessHours(),
      };
    },
    { latencyMs: 900, failsOn: ["error", "offline", "timeout"] },
  );
}

export async function fetchInquiry(reference: string): Promise<Inquiry> {
  return mockCall(
    () => {
      const i = inquiryByReference(reference);
      if (!i) {
        throw new ApiError(
          "Inquiry not found",
          "error",
          "Check the reference in your WhatsApp or email acknowledgement. If it still doesn't work, message us with the phone number you used.",
          false,
        );
      }
      return i;
    },
    { latencyMs: 450, failsOn: ["error", "offline", "timeout"] },
  );
}

/** Price/availability shown on the ADP for a given pax + variant selection. */
export async function quoteActivity(
  slug: string,
  pax: PaxCount,
  variantId?: string,
  addOnIds: string[] = [],
) {
  return mockCall(
    () => {
      const a = activityBySlug(slug);
      if (!a) throw new ApiError("Unknown activity", "error", "Try searching again.");
      return computeBreakdown(a, pax, variantId, addOnIds);
    },
    { latencyMs: 380, failsOn: ["error", "timeout", "offline"] },
  );
}

export type { MockScenario };
export { ApiError } from "./client";

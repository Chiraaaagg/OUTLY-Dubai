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
  Money,
  OrderStatus,
  PaxCount,
  Rail,
  SearchFilters,
  SearchResult,
  Traveller,
} from "../types";
import { bookingReference } from "../utils";
import * as analytics from "../analytics";
import { ApiError, currentScenario, mockCall, type MockScenario } from "./client";

/* ---------------------------------------------------------------------------
 * Real transport — the inquiry endpoints are live; everything else is still
 * mocked until its backend lands. Errors arrive as the §12 envelope
 * `{ error: { code, message, recovery, retryable, details } }` and are mapped
 * to `ApiError` so the designed recovery states keep working unchanged.
 * ------------------------------------------------------------------------ */

const REQUEST_TIMEOUT_MS = 30_000;

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    recovery?: string;
    retryable?: boolean;
    details?: { fields?: Record<string, string>; retryAfterSeconds?: number } & Record<string, unknown>;
  };
}

/** Server error codes → the frontend's scenario taxonomy. Unknown codes render the generic "error" state. */
function apiErrorFromEnvelope(status: number, body: unknown): ApiError {
  const err = (body as ErrorEnvelope | null)?.error;
  const message = err?.message || "Something went wrong at our end";
  const fallbackRecovery =
    "That's on us, not you. Try again in a moment — or message us on WhatsApp and we'll sort it out.";

  const code = err?.code;
  switch (code) {
    case "RATE_LIMITED":
      return new ApiError(message, "error", err?.recovery || "Please wait a moment and try again — or message us on WhatsApp.", true, undefined, code, status);
    case "VALIDATION_FAILED": {
      const fields = err?.details?.fields ?? {};
      const listed = Object.values(fields).filter(Boolean);
      const recovery = listed.length ? listed.join(" ") : err?.recovery || "Check the highlighted fields and try again.";
      return new ApiError(message, "error", recovery, false, fields, code, status);
    }
    case "NOT_FOUND":
      return new ApiError(
        message,
        "error",
        err?.recovery ||
          "Check the reference in your WhatsApp or email acknowledgement and the phone number you used. If it still doesn't work, message us on WhatsApp.",
        false,
        undefined,
        code,
        status,
      );
    case "UNAUTHORIZED":
      return new ApiError(message, "error", err?.recovery || "Sign in and try again.", false, undefined, code, status);
    case "NOT_CONFIGURED":
      return new ApiError(message, "error", err?.recovery || "This isn't available yet. Track your inquiry with your reference instead.", false, undefined, code, status);
    case "SPAM_REJECTED":
    case "FORBIDDEN":
    case "CONFLICT":
      return new ApiError(message, "error", err?.recovery || fallbackRecovery, false, undefined, code, status);
    default:
      return new ApiError(message, "error", err?.recovery || fallbackRecovery, err?.retryable ?? status >= 500, undefined, code, status);
  }
}

/** JSON request with the timeout / offline / envelope mapping every real endpoint shares. Cookies ride along (`same-origin`). */
async function request<T>(method: "GET" | "POST" | "PATCH" | "PUT", path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError(
        "Request timed out",
        "timeout",
        "That took too long. Try again, or send it on WhatsApp — nothing you typed is lost.",
      );
    }
    throw new ApiError(
      "Network unreachable",
      "offline",
      "You appear to be offline. Check your connection and try again — nothing has been sent.",
    );
  }
  clearTimeout(timer);

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) throw apiErrorFromEnvelope(res.status, payload);
  return payload as T;
}

const postJson = <T>(path: string, body: unknown) => request<T>("POST", path, body);
const getJson = <T>(path: string) => request<T>("GET", path);

interface ClientContext {
  sessionId?: string;
  anonId?: string;
  attribution?: Record<string, unknown>;
}

/**
 * First-party session/anon ids and attribution from `src/lib/analytics.ts`.
 * `getClientContext` is exported by the analytics module; guarded so this file
 * compiles and runs even if that export is absent in a given build.
 */
function clientContext(): ClientContext {
  const fn = (analytics as unknown as { getClientContext?: () => ClientContext | undefined }).getClientContext;
  if (typeof fn !== "function") return {};
  try {
    return fn() ?? {};
  } catch {
    return {};
  }
}

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
  travelDateTo?: string;
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
  /** Server row id — absent from the design-system mock. */
  id?: string;
  reference: string;
  slaDueAt: string;
  agent: Agent;
  outOfHours: boolean;
}

/**
 * POST /api/inquiries. Server-side this validates, rate-limits, snapshots
 * indicative prices, creates inquiry + items, assigns an agent, starts the SLA
 * timer, fires the WhatsApp/email ack and emits `inquiry_submitted` → Meta Lead.
 *
 * The real endpoint is used in the normal case; `?mock=<scenario>` keeps the
 * client mirror alive so every designed state on /design-system stays
 * reviewable without a database.
 */
export async function submitInquiry(input: SubmitInquiryInput): Promise<InquiryResult> {
  if (currentScenario() === "ok") {
    const ctx = clientContext();
    return postJson<InquiryResult>("/api/inquiries", {
      ...input,
      attribution: ctx.attribution,
      sessionId: ctx.sessionId,
      anonId: ctx.anonId,
    });
  }
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

/** Customer-safe projection returned by POST /api/inquiries/lookup (server `inquiryService.toCustomerView`). */
export interface InquiryLookupResult {
  id: string;
  reference: string;
  status: Inquiry["status"];
  source: InquirySource;
  leadName: string;
  /** Masked: +91•••••3210 */
  leadPhone: string;
  leadPhoneMasked: string;
  leadEmail?: string;
  countryCode: string;
  currency: "INR" | "AED";
  indicativeTotal: { inr: number; aed: number };
  itemCount: number;
  itemTitles: string[];
  travelDateFrom?: string;
  travelDateTo?: string;
  datesFlexible: boolean;
  pax?: PaxCount;
  guests: number;
  dietary?: Dietary;
  hotel?: string;
  specialRequests?: string;
  budgetBand?: BudgetBand;
  agent?: Agent;
  slaDueAt?: string;
  firstResponseAt?: string;
  lastContactAt?: string;
  convertedOrderReference?: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    kind: "activity" | "combo";
    slug: string;
    title: string;
    image?: string;
    date?: string;
    time?: string;
    variantId?: string;
    variantName?: string;
    pax: PaxCount;
    addOnIds: string[];
    indicativeUnit: { inr: number; aed: number };
    indicativeTotal: { inr: number; aed: number };
    confirmedTotal?: { inr: number; aed: number };
    availabilityCheckedAt?: string;
  }>;
  timeline: Array<{ kind: "status" | "system" | "contact"; toStatus?: Inquiry["status"]; createdAt: string }>;
}

/**
 * POST /api/inquiries/lookup — reference + phone both required (pivot §9 #4).
 * Any mismatch is a 404; the endpoint never reveals whether a reference exists.
 * Rate limited server-side (5 per IP per 15 minutes).
 */
export async function lookupInquiry(
  reference: string,
  phone: string,
  countryCode = "+91",
): Promise<InquiryLookupResult> {
  return postJson<InquiryLookupResult>("/api/inquiries/lookup", {
    reference: reference.trim(),
    phone: phone.replace(/\s/g, ""),
    countryCode,
  });
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

/* ---------------------------------------------------------------------------
 * Customer sign-in + account (impl/customer-auth-contract.md §3). Real
 * endpoints only — no mock: the session lives in an httpOnly cookie the
 * browser sends with every same-origin request, so nothing here holds a token.
 * ------------------------------------------------------------------------ */

/** Mirror of the server's `CustomerPublic`. */
export interface CustomerPublic {
  id: string;
  phoneE164: string;
  /** +91•••••3210 */
  phoneMasked: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  dietary?: Dietary;
  hotel?: string;
  preferredCurrency: "INR" | "AED";
  createdAt: string;
}

export interface OtpChallenge {
  challengeId: string;
  expiresInSeconds: number;
  phoneMasked: string;
}

export interface CustomerPreferences {
  whatsappTransactional: boolean;
  whatsappMarketing: boolean;
  email: boolean;
}

/** Customer projection of an order (server `customerService.listOrders`). No net cost, no payment rows. */
export interface CustomerOrder {
  id: string;
  reference: string;
  status: OrderStatus | string;
  placedAt: string;
  paidAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  currency: "INR" | "AED";
  totals: { subtotal: Money; discount: Money; tax: Money; total: Money };
  total: Money;
  items: Array<{
    id: string;
    title: string;
    image?: string;
    date?: string;
    time?: string;
    pax?: PaxCount;
    total: Money;
    status: string;
  }>;
  sourceInquiryReference?: string;
}

/**
 * POST /api/auth/otp/request. `phone` is the national number, `countryCode`
 * "+91" | "+971". 503 NOT_CONFIGURED when sign-in is off in this environment;
 * 429 after 3 codes per phone per 15 minutes. Never says whether the phone
 * already has an account.
 */
export async function requestOtp(input: { phone: string; countryCode: string }): Promise<OtpChallenge> {
  return postJson<OtpChallenge>("/api/auth/otp/request", {
    phone: input.phone.replace(/\s/g, ""),
    countryCode: input.countryCode,
  });
}

/**
 * POST /api/auth/otp/verify. On success the server sets the session cookies;
 * `linkedInquiries` is how many earlier inquiries were attached to the account.
 * Wrong code → VALIDATION_FAILED with `fields.code`; expired/used → UNAUTHORIZED;
 * unknown challenge → NOT_FOUND.
 */
export async function verifyOtp(input: { challengeId: string; code: string }): Promise<{ customer: CustomerPublic; linkedInquiries: number }> {
  return postJson("/api/auth/otp/verify", { challengeId: input.challengeId, code: input.code.replace(/\D/g, "") });
}

/** POST /api/auth/logout — revokes the session and clears both cookies. */
export async function logoutCustomer(): Promise<{ ok: true }> {
  return postJson<{ ok: true }>("/api/auth/logout", {});
}

/** GET /api/auth/me — the signed-in customer, or throws UNAUTHORIZED (401). */
export async function fetchMe(): Promise<CustomerPublic> {
  const r = await getJson<{ customer: CustomerPublic }>("/api/auth/me");
  return r.customer;
}

/** PATCH /api/me — partial profile update. An empty string clears a field; omit to leave it unchanged. */
export async function updateMe(patch: {
  fullName?: string;
  email?: string;
  dietary?: Dietary | "";
  hotel?: string;
  preferredCurrency?: "INR" | "AED";
}): Promise<CustomerPublic> {
  const r = await request<{ customer: CustomerPublic }>("PATCH", "/api/me", patch);
  return r.customer;
}

/** GET /api/me/inquiries — same projection as `lookupInquiry`, for every inquiry linked to the phone. */
export async function fetchMyInquiries(): Promise<InquiryLookupResult[]> {
  const r = await getJson<{ items: InquiryLookupResult[] }>("/api/me/inquiries");
  return r.items;
}

/** GET /api/me/orders. */
export async function fetchMyOrders(): Promise<CustomerOrder[]> {
  const r = await getJson<{ items: CustomerOrder[] }>("/api/me/orders");
  return r.items;
}

/** GET /api/me/preferences. */
export async function fetchPreferences(): Promise<CustomerPreferences> {
  return getJson<CustomerPreferences>("/api/me/preferences");
}

/** PUT /api/me/preferences — full replacement; each change is a new consent row. */
export async function updatePreferences(prefs: CustomerPreferences): Promise<CustomerPreferences> {
  return request<CustomerPreferences>("PUT", "/api/me/preferences", prefs);
}

/**
 * POST /api/me/delete-request — logs the request and alerts ops. Nothing is
 * deleted immediately; the account keeps working until ops anonymise it.
 */
export async function requestDeletion(input: { reason?: string } = {}): Promise<{ ok: true }> {
  return postJson<{ ok: true }>("/api/me/delete-request", input.reason ? { reason: input.reason } : {});
}

/** GET /api/me/export is a file download — navigate to it (`window.location.href = exportDataUrl()`), not fetch. */
export const exportDataUrl = () => "/api/me/export";

export type { MockScenario };
export { ApiError } from "./client";

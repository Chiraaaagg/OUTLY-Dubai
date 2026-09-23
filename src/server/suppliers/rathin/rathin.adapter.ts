import { Errors } from "../../lib/errors";
import type {
  AvailabilityRequest,
  AvailabilityResult,
  BookingRequest,
  BookingResult,
  CancelResult,
  LookupResult,
  SupplierCapabilities,
  SupplierPort,
} from "../port";

/**
 * RathinLiveAdapter — SKELETON. Rathin is NOT READY (§16 §7):
 *
 *   "It cannot be implemented safely today ... No base URL, no credentials,
 *    no environment. Nothing can be tested. No error response exists anywhere
 *    in the collection. Eleven open questions in §9, of which Q1–Q8 are
 *    blocking. Development on the Rathin adapter must not begin until Q1–Q8
 *    are answered."
 *
 * So this file is gated twice and does nothing:
 *   1. `SUPPLIER_ADAPTER_RATHIN=live` AND every `RATHIN_*` variable present,
 *      otherwise the registry never constructs it (it hands out the mock).
 *   2. Constructed with `config === null` → every method throws
 *      `Errors.notConfigured("Rathin")`. Constructed with a config → every
 *      method throws `Errors.notImplemented("Rathin <method>")`.
 *
 * Nothing here fakes a response. The `TODO(rathin):` block above each method
 * quotes the §16 questions that must be answered before it can be written.
 * The pure helpers that CAN be written now live in `rathin.codec.ts`.
 */

export interface RathinConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** §16 C10 — sent on every call once its meaning is confirmed (Q11). */
  agencyId: string;
  timeoutMs: number;
}

/** The env slice the adapter needs. `Env` from `src/server/lib/env.ts` satisfies it. */
export interface RathinEnvSlice {
  SUPPLIER_ADAPTER_RATHIN: "mock" | "live";
  RATHIN_BASE_URL?: string;
  RATHIN_CLIENT_ID?: string;
  RATHIN_CLIENT_SECRET?: string;
  RATHIN_AGENCY_ID?: string;
  RATHIN_TIMEOUT_MS: number;
}

/** Null unless mode is `live` and every variable is present. Never partially configured. */
export function rathinConfigFrom(env: RathinEnvSlice): RathinConfig | null {
  if (env.SUPPLIER_ADAPTER_RATHIN !== "live") return null;
  const { RATHIN_BASE_URL, RATHIN_CLIENT_ID, RATHIN_CLIENT_SECRET, RATHIN_AGENCY_ID } = env;
  if (!RATHIN_BASE_URL || !RATHIN_CLIENT_ID || !RATHIN_CLIENT_SECRET || !RATHIN_AGENCY_ID) return null;
  return {
    baseUrl: RATHIN_BASE_URL.replace(/\/+$/, ""),
    clientId: RATHIN_CLIENT_ID,
    clientSecret: RATHIN_CLIENT_SECRET,
    agencyId: RATHIN_AGENCY_ID,
    timeoutMs: env.RATHIN_TIMEOUT_MS,
  };
}

/** The eight requests in the "Rathin API -V2" collection (§16 §0). Paths only; no schemas are verified for v2 except /price. */
export const RATHIN_ENDPOINTS = {
  token: { method: "GET", path: "/api/auth/v2/token" },
  parks: { method: "POST", path: "/api/park/v2/availability/park" },
  ticketTypes: { method: "POST", path: "/api/park/v2/common/search/custTicketType" },
  timeslots: { method: "POST", path: "/api/park/v2/timeslot" },
  price: { method: "POST", path: "/api/park/v2/price" },
  book: { method: "POST", path: "/api/park/v2/book" },
} as const;

/**
 * §16 C2 — seed values for `suppliers.capabilities` on the Rathin row. Three
 * are known `false` from the collection; two are pending questions and are
 * set to the SAFE value until answered.
 */
export const RATHIN_CAPABILITIES: SupplierCapabilities = {
  instantConfirmation: true, // A4: booking sample returns TICKETED in-band
  supportsCancellation: false, // A6: no endpoint
  supportsAmendment: false, // no endpoint
  supportsIdempotency: false, // A11: no client reference field — pending Q7 (pricingKey reuse)
  supportsBookingLookup: false, // A12: no endpoint — the finding with the largest blast radius
  hasTimeslots: true,
  hasRealtimeCapacity: false, // pending Q4 (totalTickets semantics)
  availabilityTtlSeconds: 15 * 60,
  maxRps: 1, // unknown rate limits — assume modest (§02 §1.3)
  currency: "AED", // pending Q3 — configured, never inferred
};

/**
 * Required shape of `product_supplier_mappings.external_ref` for a Rathin
 * mapping (§16 D5). `paxTypeId`/`bookingVariant` are added once Q6 is answered.
 */
export interface RathinExternalRef {
  parkId: number;
  ticketTypeId: number;
  /** Chooses between the two `/price` request shapes. */
  ticketMode: "timed" | "open";
  paxTypeId?: number;
  bookingVariant?: "lead_name" | "per_pax";
}

export function isRathinExternalRef(ref: Record<string, unknown>): ref is RathinExternalRef & Record<string, unknown> {
  return (
    typeof ref.parkId === "number" &&
    typeof ref.ticketTypeId === "number" &&
    (ref.ticketMode === "timed" || ref.ticketMode === "open")
  );
}

export class RathinLiveAdapter implements SupplierPort {
  readonly name = "rathin-live";

  constructor(private readonly config: RathinConfig | null) {}

  capabilities(): SupplierCapabilities {
    return RATHIN_CAPABILITIES;
  }

  private assertConfigured(): RathinConfig {
    if (!this.config) throw Errors.notConfigured("Rathin");
    return this.config;
  }

  async checkAvailability(_req: AvailabilityRequest): Promise<AvailabilityResult> {
    this.assertConfigured();
    // TODO(rathin): blocked on §16 questions before this can be written:
    //   Q1 — base URL and credentials; is there a sandbox/UAT? Without one no
    //        call can be tested.
    //   Q2 — token TTL, expiry field, behaviour on expiry (401/403/200+error),
    //        refresh endpoint. Token lifecycle per §16 C9: cache, re-auth once
    //        on 401, never per call.
    //   Q4 — `totalTickets` semantics in GetParkTimeSlots: remaining inventory
    //        or configured cap? Every sample slot returns exactly 100. Until
    //        answered: status is `available | sold_out` only, `spotsLeft: null`,
    //        `capacityIsReliable: false` (§16 C5).
    //   Open tickets have NO availability endpoint at all; the only proxy is a
    //   `/price` call for the date and observing whether it fails.
    //   Success detection MUST use `parseRathinEnvelope` (§16 C4), never `status`.
    throw Errors.notImplemented("Rathin checkAvailability");
  }

  async createBooking(_req: BookingRequest): Promise<BookingResult> {
    this.assertConfigured();
    // TODO(rathin): blocked on §16 questions before this can be written:
    //   Q3 — currency of adultFare/childFare/grandTotal (no currency field).
    //   Q5 — park entry: the booking response returns `ticketNo` as a plain
    //        string with no QR/barcode/PDF/URL. Does a printed number admit the
    //        guest? Do not generate a barcode until the symbology is confirmed.
    //   Q6 — booking variant (lead-name vs per-pax) per ticket type, and where
    //        `paxTypeId` comes from (value 213 is returned by no endpoint).
    //        Launch with lead-name bookings only (§16 C7).
    //   Q7 — pricingKey reuse: same key submitted twice → one booking or two?
    //        Determines whether there is ANY supplier-side idempotency.
    //   Q8 — pricingKey integrity: is the cleartext base64 amount re-validated
    //        server-side?
    //   Q9 — pricingKey validity window vs our 20-minute lock.
    //   Required flow once answered (§16 C6, B1/B4):
    //     1. re-fetch `/price`, compare grandTotal to `expectedNetCostAedMinor`
    //        via `rathinFareToMinor`; mismatch → SupplierError("price_changed")
    //     2. POST `/book` with the FRESH pricingKey, budget 45s, ONCE
    //     3. timeout → do NOT retry; return status "unknown" with the full
    //        request payload for a P1 ops task (no lookup endpoint exists)
    //     4. success → tickets = paxDetails[].ticketNo; supplierRef = bookingRefId
    //   The v2 `/book` response shape is UNVERIFIED (only a v1 sample exists);
    //   capture real v2 fixtures before writing the parser (§16 C11).
    throw Errors.notImplemented("Rathin createBooking");
  }

  async lookupBooking(_supplierRef: string): Promise<LookupResult> {
    this.assertConfigured();
    // TODO(rathin): NO booking retrieval endpoint exists in the collection
    //   (§16 A12, C1). This stays `not_supported` unless Rathin adds one.
    //   The reconciliation sweep must fork on `supportsBookingLookup === false`
    //   and escalate `unknown` bookings to ops instead of calling this.
    //   If Rathin later provides GetBooking: budget 10s, 5 retries with backoff.
    return { outcome: "not_supported", reason: "Rathin exposes no booking lookup endpoint (§16 C1)" };
  }

  async cancelBooking(_supplierRef: string, _reason: string): Promise<CancelResult> {
    this.assertConfigured();
    // TODO(rathin): NO cancellation endpoint exists (§16 A6). Also unanswered:
    //   does the CONTRACT permit out-of-band cancellation by email/phone
    //   (§16 §9, "lower urgency")? If yes this becomes an ops task and the
    //   product's customer-facing policy may soften; if no, every Rathin SKU
    //   is non-refundable and must say so in bold before purchase (§16 B5, D9).
    //   Either way the customer is refunded regardless of supplier recovery.
    return { outcome: "not_supported", reason: "Rathin exposes no cancellation endpoint (§16 A6)" };
  }
}

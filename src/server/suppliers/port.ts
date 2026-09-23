import type { MockScenario } from "@/lib/api/client";
import type { PaxCount } from "@/lib/types";
import { AppError } from "../lib/errors";

/**
 * SupplierPort — the only supplier vocabulary the application knows
 * (docs/backend/02-supplier-integration.md §3, amended by §16 C1/C2/C5).
 *
 * Rules that shape this file:
 *  - Every method must be implementable by a human with a WhatsApp thread
 *    (that is the ManualAdapter). If a method only makes sense for Rathin, it
 *    does not belong here.
 *  - `capabilities()` is load-bearing: product behaviour follows capability
 *    flags, never `if (supplier === "rathin")`.
 *  - `lookupBooking` and `cancelBooking` are OPTIONAL capabilities (§16 C1).
 *    Adapters that cannot do them return `not_supported` — they never pretend.
 *  - This module is imported by unit tests, so it must not import
 *    "server-only", env, db, or the logger. It is a vocabulary, not a service.
 *
 * Nothing here talks to a network today. Rathin is NOT READY (§16 §7) and no
 * credentials exist; see `rathin/rathin.adapter.ts` for the gated skeleton.
 */

/* ---------------------------------------------------------------------------
 * Mapping reference — what the fulfilment service hands an adapter
 * ------------------------------------------------------------------------ */

/**
 * A `product_supplier_mappings` row plus the bits of its neighbours an adapter
 * needs. `externalRef` is opaque JSONB on purpose (schema comment on
 * `ProductSupplierMapping`): only the adapter named by `adapter` may read it,
 * and its shape is documented per adapter (Rathin: §16 D5).
 */
export interface SupplierMappingRef {
  mappingId: string;
  productId: string;
  /** Storefront slug — the mock adapter keys the fixture availability on it. */
  productSlug: string;
  supplierId: string;
  supplierCode: string;
  /** `suppliers.adapter`: "manual" | "portal" | "rathin". Selects the adapter in the registry. */
  adapter: string;
  variantCode?: string | null;
  priority: number;
  externalRef: Record<string, unknown>;
}

/* ---------------------------------------------------------------------------
 * Availability
 * ------------------------------------------------------------------------ */

export interface AvailabilityRequest {
  mapping: SupplierMappingRef;
  /** YYYY-MM-DD, Asia/Dubai local date. */
  date: string;
  pax: PaxCount;
  /** HH:mm when the product has timeslots and the customer has picked one. */
  timeslot?: string;
}

/**
 * Availability status. The first four are exactly the frontend
 * `AvailabilityResponse["status"]` (src/lib/api/index.ts). `unknown` is the
 * honest answer from a manual supplier — ops checks by hand — and from an API
 * whose capacity semantics are unverified (§16 C5). The storefront never
 * renders scarcity from an `unknown` result.
 */
export type AvailabilityStatus = "available" | "limited" | "sold_out" | "quote_only" | "unknown";

export interface AvailabilitySlot {
  time: string;
  status: AvailabilityStatus;
  /** Only when the supplier reports real remaining capacity. Never invented. */
  spotsLeft?: number;
}

/**
 * Normalised availability. Shape-compatible with the frontend
 * `AvailabilityResponse` so the FUTURE `/api/availability` route can return it
 * with no translation beyond dropping the two provenance fields.
 */
export interface AvailabilityResult {
  status: AvailabilityStatus;
  /** `null` when the supplier cannot report remaining capacity (§16 C5). */
  spotsLeft: number | null;
  slots: AvailabilitySlot[];
  /** AC-ADP-02: next three bookable dates when `status` is `sold_out`. */
  nextDates: string[];
  /** ISO timestamp of the check; the UI shows "as of HH:MM" when serving stale data. */
  checkedAt: string;
  /** Provenance — never shown to customers, always logged. */
  source: "manual" | "mock" | "live";
  /** §16 D4: `false` until the supplier proves `spotsLeft` is remaining inventory. */
  capacityIsReliable: boolean;
}

/* ---------------------------------------------------------------------------
 * Booking
 * ------------------------------------------------------------------------ */

export interface BookingTraveller {
  fullName: string;
  /** E.164. */
  phoneE164: string;
  email?: string;
}

export interface BookingRequest {
  /** `idempotencyKeyFor(orderId, orderItemId)` — see below. */
  idempotencyKey: string;
  orderId: string;
  orderItemId: string;
  /** OUT-… human reference, quoted to the supplier in manual messages. */
  orderReference: string;
  mapping: SupplierMappingRef;
  serviceDate: string;
  timeslot?: string;
  pax: PaxCount;
  /** Lead traveller. Per-pax details are a FUTURE field gated on §16 Q6. */
  lead: BookingTraveller;
  /**
   * Net cost the order was priced with, in AED minor units. An API adapter
   * re-fetches the supplier price and fails with `price_changed` on mismatch
   * (§16 C6); a manual adapter just records it for ops.
   */
  expectedNetCostAedMinor?: bigint;
  specialRequests?: string;
}

/** One ticket for one pax. Rathin returns bare `ticketNo` strings only (§16 C3). */
export interface TicketArtifact {
  paxIndex: number;
  ticketNo: string;
  /** Present only when the supplier issues a downloadable artifact; copied to our storage before use (§02 §4.1). */
  artifactUrl?: string;
}

/**
 * The row the FUTURE `fulfilment.service` persists to `supplier_bookings`
 * (table to add — §16 D2). Adapters return it; they never write it.
 */
export interface SupplierBookingIntent {
  orderId: string;
  orderItemId: string;
  supplierId: string;
  mappingId: string;
  idempotencyKey: string;
  status: "pending_manual" | "confirmed" | "unknown" | "rejected";
  /** Supplier-side reference once one exists (Rathin: `bookingRefId`). */
  supplierRef: string | null;
  /** Supplier's own status string, verbatim (Rathin: "TICKETED"). */
  supplierStatus: string | null;
  tickets: TicketArtifact[];
  /** What we asked for — kept so a human can reconcile or resend (§16 B1). No PII beyond the lead's name/contact. */
  requestPayload: Record<string, unknown>;
  /** Supplier response, verbatim, for audit. `null` for manual. */
  rawResponse: unknown;
  /** ISO timestamp the intent was produced. */
  createdAt: string;
}

export type BookingResult =
  /** Supplier confirmed synchronously. Order item → confirmed; voucher pipeline runs. */
  | { outcome: "confirmed"; booking: SupplierBookingIntent }
  /** Nothing automatic happened. Ops confirms by hand within the 2h SLA (AC-INV-03). Order → supplier_pending. */
  | { outcome: "pending_manual"; booking: SupplierBookingIntent }
  /** Supplier said no, explicitly. Rejection saga (§02 §7.3). */
  | { outcome: "rejected"; booking: SupplierBookingIntent; code: SupplierErrorCode; message: string };

/* ---------------------------------------------------------------------------
 * Lookup / cancel — optional capabilities
 * ------------------------------------------------------------------------ */

export type LookupResult =
  | { outcome: "found"; supplierRef: string; supplierStatus: string; tickets: TicketArtifact[]; rawResponse: unknown }
  | { outcome: "not_found"; supplierRef: string }
  /** §16 C1: the adapter cannot ask. The reconciliation sweep must not call this adapter; it escalates to ops instead. */
  | { outcome: "not_supported"; reason: string };

export type CancelResult =
  | { outcome: "cancelled"; supplierRef: string; rawResponse: unknown }
  /** Adapter accepted the request but the supplier has not confirmed; ops follows up. */
  | { outcome: "queued"; supplierRef: string }
  /** No API and no out-of-band process known. Customer is refunded regardless (§02 §7.4). */
  | { outcome: "not_supported"; reason: string };

/* ---------------------------------------------------------------------------
 * Capabilities
 * ------------------------------------------------------------------------ */

export interface SupplierCapabilities {
  instantConfirmation: boolean;
  supportsCancellation: boolean;
  supportsAmendment: boolean;
  supportsIdempotency: boolean;
  /** `false` ⇒ bookings are HIGH RISK; a timeout is unresolvable by software (§02 §5.4, §16 C1). */
  supportsBookingLookup: boolean;
  hasTimeslots: boolean;
  /** `false` ⇒ `spotsLeft` is never populated and no scarcity copy is shown (§16 C5). */
  hasRealtimeCapacity: boolean;
  availabilityTtlSeconds: number;
  maxRps: number;
  currency: "AED";
}

/* ---------------------------------------------------------------------------
 * The port
 * ------------------------------------------------------------------------ */

export interface SupplierPort {
  /** Stable identifier for logs and metrics: "manual" | "rathin-mock" | "rathin-live". */
  readonly name: string;
  capabilities(): SupplierCapabilities;
  checkAvailability(req: AvailabilityRequest): Promise<AvailabilityResult>;
  /**
   * Exactly-once semantics are the CALLER's job: the fulfilment service must
   * persist the intent keyed on `idempotencyKey` before calling this, and must
   * never retry automatically (§02 §5.3). Adapters may throw `SupplierError`.
   */
  createBooking(req: BookingRequest): Promise<BookingResult>;
  lookupBooking(supplierRef: string): Promise<LookupResult>;
  cancelBooking(supplierRef: string, reason: string): Promise<CancelResult>;
}

/* ---------------------------------------------------------------------------
 * Errors — the frontend's MockScenario taxonomy is the canonical one (§02 §5.1)
 * ------------------------------------------------------------------------ */

/**
 * Every supplier failure maps to exactly one designed customer state. The
 * subset of `MockScenario` an adapter may raise; "empty", "slow", "offline",
 * "payment_*" are client-side or payment states and never come from here.
 */
export type SupplierErrorCode = Extract<
  MockScenario,
  "error" | "timeout" | "sold_out" | "price_changed" | "supplier_pending" | "pickup_unavailable"
>;

const RECOVERY: Record<SupplierErrorCode, { message: string; recovery: string; retryable: boolean }> = {
  error: {
    message: "The operator's system returned an error",
    recovery: "That's on us, not you. Try again in a moment — or message us on WhatsApp.",
    retryable: true,
  },
  timeout: {
    message: "The operator's system did not respond in time",
    recovery: "The operator's system is slow right now. Try again, or message us on WhatsApp and we'll confirm your date directly.",
    retryable: true,
  },
  sold_out: {
    message: "No availability for that date",
    recovery: "Pick one of the next available dates, or message us on WhatsApp for alternatives.",
    retryable: false,
  },
  price_changed: {
    message: "The operator's price changed since you were quoted",
    recovery: "Review the new price and confirm again — nothing has been charged.",
    retryable: false,
  },
  supplier_pending: {
    message: "Awaiting confirmation from the operator",
    recovery: "We're confirming with the operator — you'll have your voucher within 2 hours.",
    retryable: false,
  },
  pickup_unavailable: {
    message: "Pickup is not available for that hotel",
    recovery: "Choose a different pickup point, or message us on WhatsApp for a private transfer.",
    retryable: false,
  },
};

const HTTP_STATUS: Record<SupplierErrorCode, number> = {
  error: 502,
  timeout: 504,
  sold_out: 409,
  price_changed: 409,
  supplier_pending: 202,
  pickup_unavailable: 422,
};

export class SupplierError extends Error {
  readonly code: SupplierErrorCode;
  readonly supplier: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  /** The underlying failure, for logs only — never serialised to a client. */
  readonly cause?: unknown;

  constructor(code: SupplierErrorCode, supplier: string, opts: { message?: string; details?: Record<string, unknown>; cause?: unknown } = {}) {
    super(opts.message ?? RECOVERY[code].message);
    this.name = "SupplierError";
    this.code = code;
    this.supplier = supplier;
    this.retryable = RECOVERY[code].retryable;
    this.details = opts.details;
    this.cause = opts.cause;
  }

  /** The `MockScenario` the storefront renders for this failure. */
  get scenario(): MockScenario {
    return this.code;
  }

  /** Render as the §12 error envelope. `code` is the scenario, so the frontend client maps it 1:1. */
  toAppError(): AppError {
    return new AppError({
      status: HTTP_STATUS[this.code],
      code: "error",
      message: this.message,
      recovery: RECOVERY[this.code].recovery,
      retryable: this.retryable,
      details: { scenario: this.code, supplier: this.supplier, ...(this.details ?? {}) },
    });
  }
}

export function isSupplierError(e: unknown): e is SupplierError {
  return e instanceof SupplierError;
}

/* ---------------------------------------------------------------------------
 * Timeout budgets (§02 §5.2) — every supplier call gets an explicit budget
 * ------------------------------------------------------------------------ */

export const TIMEOUT_BUDGET_MS = {
  /** Browse path. On breach: serve stale cache with a visible timestamp. */
  availabilityBrowse: 2_500,
  /** Pre-payment re-check. On breach: fail the transaction (AC-INV-01). */
  availabilityPrePayment: 6_000,
  /** Once. Never retried automatically. */
  createBooking: 45_000,
  lookupBooking: 10_000,
  cancelBooking: 20_000,
} as const;

/**
 * Race a supplier call against its budget. Rejects with a `SupplierError`
 * of code `timeout`. The underlying promise is NOT cancelled — HTTP fetches
 * should also pass an `AbortSignal` — but its late result is discarded.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, supplier: string, operation: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SupplierError("timeout", supplier, { details: { operation, budgetMs: ms } })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/* ---------------------------------------------------------------------------
 * Idempotency key convention
 * ------------------------------------------------------------------------ */

/**
 * `order:<orderId>:item:<orderItemId>` — one supplier booking per order item,
 * ever. The fulfilment service stores it on `supplier_bookings` with a unique
 * index and passes it to adapters that support idempotency (Rathin does not,
 * pending §16 Q7 — the key then protects only our side).
 */
export function idempotencyKeyFor(orderId: string, orderItemId: string): string {
  return `order:${orderId}:item:${orderItemId}`;
}

export function parseIdempotencyKey(key: string): { orderId: string; orderItemId: string } | null {
  const m = /^order:([^:]+):item:([^:]+)$/.exec(key);
  return m ? { orderId: m[1], orderItemId: m[2] } : null;
}

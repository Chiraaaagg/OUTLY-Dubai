import type { MockScenario } from "@/lib/api/client";
import { getAvailability, nextAvailableDates } from "@/lib/availability";
import { activityBySlug } from "@/lib/data/activities";
import { hash } from "@/lib/utils";
import type { Activity } from "@/lib/types";
import { RATHIN_CAPABILITIES } from "./rathin.adapter";
import {
  SupplierError,
  type AvailabilityRequest,
  type AvailabilityResult,
  type AvailabilityStatus,
  type BookingRequest,
  type BookingResult,
  type CancelResult,
  type LookupResult,
  type SupplierBookingIntent,
  type SupplierCapabilities,
  type SupplierPort,
} from "../port";

/**
 * RathinMockAdapter — deterministic stand-in for the live adapter so the
 * booking engine can be tested end-to-end with no supplier (§04.7: "mock
 * adapters are not throwaway"). Selected by the registry whenever
 * `SUPPLIER_ADAPTER_RATHIN` is `mock` (the default) — which is every
 * environment today.
 *
 * Behaviour mirrors the storefront exactly:
 *  - availability is `getAvailability(activity, date)` from
 *    `src/lib/availability.ts`, the same hash the ADP renders, so server and
 *    client never disagree about a date;
 *  - `scenario` forces the same failure states the `?mock=` switch does on
 *    the design-system page (`sold_out`, `timeout`, `error`, `price_changed`).
 *
 * Honesty rules it keeps even as a mock:
 *  - capabilities are the REAL Rathin flags (§16 C2): no lookup, no
 *    cancellation, no idempotency. An engine test that passes against this
 *    mock has exercised the ops-escalation branches, not a friendlier fantasy;
 *  - `spotsLeft` is reported only where the fixture reports it, and
 *    `capacityIsReliable` is `false`, as it will be live (§16 C5);
 *  - the booking reference is derived from the idempotency key, so the same
 *    key always yields the same reference — the property the engine relies on.
 */

export interface RathinMockOptions {
  /** Force a storefront scenario. `ok` (default) follows the fixture hash. */
  scenario?: Extract<MockScenario, "ok" | "sold_out" | "timeout" | "error" | "price_changed">;
  now?: () => Date;
}

export class RathinMockAdapter implements SupplierPort {
  readonly name = "rathin-mock";
  private readonly scenario: NonNullable<RathinMockOptions["scenario"]>;
  private readonly now: () => Date;

  constructor(opts: RathinMockOptions = {}) {
    this.scenario = opts.scenario ?? "ok";
    this.now = opts.now ?? (() => new Date());
  }

  capabilities(): SupplierCapabilities {
    return RATHIN_CAPABILITIES;
  }

  private activityFor(mapping: { productSlug: string; externalRef: Record<string, unknown> }): Activity {
    // A Rathin mapping's external_ref carries parkId/ticketTypeId; the mock
    // keys on the storefront slug, which the mapping ref always carries.
    const slug = typeof mapping.externalRef.mockSlug === "string" ? mapping.externalRef.mockSlug : mapping.productSlug;
    const activity = activityBySlug(slug);
    if (!activity) throw new SupplierError("error", this.name, { message: "Unknown product for mock supplier", details: { slug } });
    return activity;
  }

  private failIfScenario(operation: string) {
    if (this.scenario === "timeout" || this.scenario === "error") {
      throw new SupplierError(this.scenario, this.name, { details: { operation, scenario: this.scenario } });
    }
  }

  async checkAvailability(req: AvailabilityRequest): Promise<AvailabilityResult> {
    this.failIfScenario("checkAvailability");
    const activity = this.activityFor(req.mapping);
    const av = getAvailability(activity, req.date);
    const forcedSoldOut = this.scenario === "sold_out";
    const status: AvailabilityStatus = forcedSoldOut ? "sold_out" : av.status === "unavailable" ? "sold_out" : av.status;
    return {
      status,
      spotsLeft: forcedSoldOut ? null : (av.spotsLeft ?? null),
      slots: forcedSoldOut
        ? []
        : av.slots.map((s) => ({ time: s.time, status: s.status === "unavailable" ? "sold_out" : s.status, spotsLeft: s.spotsLeft })),
      nextDates: nextAvailableDates(activity, req.date),
      checkedAt: this.now().toISOString(),
      source: "mock",
      capacityIsReliable: false,
    };
  }

  async createBooking(req: BookingRequest): Promise<BookingResult> {
    this.failIfScenario("createBooking");
    const base: Omit<SupplierBookingIntent, "status" | "supplierRef" | "supplierStatus" | "tickets"> = {
      orderId: req.orderId,
      orderItemId: req.orderItemId,
      supplierId: req.mapping.supplierId,
      mappingId: req.mapping.mappingId,
      idempotencyKey: req.idempotencyKey,
      requestPayload: {
        orderReference: req.orderReference,
        externalRef: req.mapping.externalRef,
        serviceDate: req.serviceDate,
        timeslot: req.timeslot ?? null,
        pax: req.pax,
        leadName: req.lead.fullName,
      },
      rawResponse: { mock: true, scenario: this.scenario },
      createdAt: this.now().toISOString(),
    };

    if (this.scenario === "price_changed") {
      throw new SupplierError("price_changed", this.name, { details: { operation: "createBooking" } });
    }

    const availability = await this.checkAvailability({ mapping: req.mapping, date: req.serviceDate, pax: req.pax, timeslot: req.timeslot });
    const slot = req.timeslot ? availability.slots.find((s) => s.time === req.timeslot) : undefined;
    const soldOut = availability.status === "sold_out" || slot?.status === "sold_out";
    if (soldOut) {
      return {
        outcome: "rejected",
        code: "sold_out",
        message: "No availability for that date",
        booking: { ...base, status: "rejected", supplierRef: null, supplierStatus: "REJECTED", tickets: [] },
      };
    }

    // Deterministic: same idempotency key → same reference and ticket numbers.
    const seed = hash(req.idempotencyKey);
    const supplierRef = `MOCK-RTN-${seed.toString(36).toUpperCase()}`;
    const paxCount = Math.max(1, req.pax.adult + req.pax.child + req.pax.infant + req.pax.senior);
    const tickets = Array.from({ length: paxCount }, (_, i) => ({ paxIndex: i, ticketNo: String(10_000_000 + ((seed + i * 7919) % 90_000_000)) }));
    return {
      outcome: "confirmed",
      booking: { ...base, status: "confirmed", supplierRef, supplierStatus: "TICKETED", tickets },
    };
  }

  async lookupBooking(_supplierRef: string): Promise<LookupResult> {
    // Mirrors live: Rathin has no lookup endpoint (§16 C1). The engine must
    // handle `not_supported` here, because it will in production.
    return { outcome: "not_supported", reason: "Rathin exposes no booking lookup endpoint (mock mirrors §16 C1)" };
  }

  async cancelBooking(_supplierRef: string, _reason: string): Promise<CancelResult> {
    return { outcome: "not_supported", reason: "Rathin exposes no cancellation endpoint (mock mirrors §16 A6)" };
  }
}

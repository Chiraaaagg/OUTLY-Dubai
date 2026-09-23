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
 * ManualAdapter — direct and portal suppliers (Tier B/C/D/E, ~90% of margin).
 *
 * Read this before assuming it does anything: IT DOES NOTHING AUTOMATIC.
 *
 *  - `checkAvailability` answers `unknown`. Ops checks with the supplier by
 *    WhatsApp/phone. There is no capacity ledger yet (§02 §3.3 describes the
 *    V1+ version that reads `capacity_ledger`); until then the storefront keeps
 *    these SKUs in inquiry mode, which is exactly what `fulfilment_mode`
 *    enforces today.
 *  - `createBooking` returns a `pending_manual` intent. It writes nothing. The
 *    FUTURE fulfilment.service persists the intent to `supplier_bookings`,
 *    messages the supplier from a template, and starts the 2h SLA timer
 *    (AC-INV-03). Ops confirms in the admin panel.
 *  - `lookupBooking` / `cancelBooking` are `not_supported`: there is no system
 *    on the other end to ask. Cancellation is an ops task; the customer is
 *    refunded regardless (§02 §7.4).
 *
 * This is a first-class adapter, not a stub (§02 §3.3): its honesty is the
 * feature. When the capacity ledger and supplier messaging land, they land
 * here, behind the same port.
 */

export const MANUAL_CAPABILITIES: SupplierCapabilities = {
  instantConfirmation: false,
  supportsCancellation: false,
  supportsAmendment: false,
  supportsIdempotency: true, // our own DB is the idempotency store
  supportsBookingLookup: false,
  hasTimeslots: false,
  hasRealtimeCapacity: false,
  availabilityTtlSeconds: 0, // nothing to cache — there is no live signal
  maxRps: 0,
  currency: "AED",
};

export class ManualAdapter implements SupplierPort {
  readonly name = "manual";

  constructor(private readonly now: () => Date = () => new Date()) {}

  capabilities(): SupplierCapabilities {
    return MANUAL_CAPABILITIES;
  }

  async checkAvailability(req: AvailabilityRequest): Promise<AvailabilityResult> {
    return {
      status: "unknown",
      spotsLeft: null,
      slots: req.timeslot ? [{ time: req.timeslot, status: "unknown" }] : [],
      nextDates: [],
      checkedAt: this.now().toISOString(),
      source: "manual",
      capacityIsReliable: false,
    };
  }

  async createBooking(req: BookingRequest): Promise<BookingResult> {
    return {
      outcome: "pending_manual",
      booking: {
        orderId: req.orderId,
        orderItemId: req.orderItemId,
        supplierId: req.mapping.supplierId,
        mappingId: req.mapping.mappingId,
        idempotencyKey: req.idempotencyKey,
        status: "pending_manual",
        supplierRef: null,
        supplierStatus: null,
        tickets: [],
        // Everything ops needs to message the supplier. No email/phone of the
        // traveller beyond the lead: suppliers get the lead name only.
        requestPayload: {
          orderReference: req.orderReference,
          supplierCode: req.mapping.supplierCode,
          productSlug: req.mapping.productSlug,
          variantCode: req.mapping.variantCode ?? null,
          externalRef: req.mapping.externalRef,
          serviceDate: req.serviceDate,
          timeslot: req.timeslot ?? null,
          pax: req.pax,
          leadName: req.lead.fullName,
          specialRequests: req.specialRequests ?? null,
          expectedNetCostAedMinor: req.expectedNetCostAedMinor?.toString() ?? null,
        },
        rawResponse: null,
        createdAt: this.now().toISOString(),
      },
    };
  }

  async lookupBooking(_supplierRef: string): Promise<LookupResult> {
    return { outcome: "not_supported", reason: "Manual supplier: confirmation is recorded by ops in the admin panel" };
  }

  async cancelBooking(_supplierRef: string, _reason: string): Promise<CancelResult> {
    return { outcome: "not_supported", reason: "Manual supplier: cancellation is an ops task; refund the customer regardless" };
  }
}

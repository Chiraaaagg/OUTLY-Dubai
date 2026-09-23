import { describe, expect, it } from "vitest";
import { isAppError } from "../../lib/errors";
import { ManualAdapter } from "../manual/manual.adapter";
import { idempotencyKeyFor, type BookingRequest, type SupplierMappingRef } from "../port";
import { RathinLiveAdapter } from "../rathin/rathin.adapter";
import { RathinMockAdapter } from "../rathin/rathin.mock";
import { rathinMode, supplierFor, type SupplierEnv } from "../registry";

const mockEnv: SupplierEnv = { SUPPLIER_ADAPTER_RATHIN: "mock", RATHIN_TIMEOUT_MS: 8000 };
const liveEnv: SupplierEnv = {
  SUPPLIER_ADAPTER_RATHIN: "live",
  RATHIN_BASE_URL: "https://example.invalid/",
  RATHIN_CLIENT_ID: "id",
  RATHIN_CLIENT_SECRET: "secret",
  RATHIN_AGENCY_ID: "1",
  RATHIN_TIMEOUT_MS: 8000,
};

const mapping: SupplierMappingRef = {
  mappingId: "m1",
  productId: "p1",
  productSlug: "evening-desert-safari-veg-jain",
  supplierId: "s1",
  supplierCode: "arabian-dunes-tourism-llc",
  adapter: "manual",
  priority: 1,
  externalRef: {},
};

const booking: BookingRequest = {
  idempotencyKey: idempotencyKeyFor("o1", "i1"),
  orderId: "o1",
  orderItemId: "i1",
  orderReference: "OUT-100001",
  mapping,
  serviceDate: "2026-10-01",
  pax: { adult: 2, child: 0, infant: 0, senior: 0 },
  lead: { fullName: "Test Lead", phoneE164: "+919999999999" },
};

describe("supplierFor", () => {
  it("manual and portal select the ManualAdapter", () => {
    expect(supplierFor("manual", mockEnv)).toBeInstanceOf(ManualAdapter);
    expect(supplierFor({ adapter: "portal", code: "emaar" }, mockEnv)).toBeInstanceOf(ManualAdapter);
  });

  it("rathin selects the mock by default", () => {
    expect(supplierFor("rathin", mockEnv)).toBeInstanceOf(RathinMockAdapter);
    expect(rathinMode(mockEnv)).toBe("mock");
  });

  it("rathin selects the live skeleton only when mode is live and every RATHIN_* is set", () => {
    expect(supplierFor("rathin", liveEnv)).toBeInstanceOf(RathinLiveAdapter);
    expect(rathinMode(liveEnv)).toBe("live");
  });

  it("a half-configured live env fails loudly with NOT_CONFIGURED rather than falling back to the mock", async () => {
    const half: SupplierEnv = { ...liveEnv, RATHIN_CLIENT_SECRET: undefined };
    expect(rathinMode(half)).toBe("live_unconfigured");
    const port = supplierFor("rathin", half);
    expect(port).toBeInstanceOf(RathinLiveAdapter);
    await expect(port.createBooking(booking)).rejects.toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
  });

  it("a fully configured live skeleton is NOT_IMPLEMENTED for every method, and never fakes a response", async () => {
    const port = supplierFor("rathin", liveEnv);
    await expect(port.checkAvailability({ mapping, date: "2026-10-01", pax: booking.pax })).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
    await expect(port.createBooking(booking)).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
    // Lookup and cancel do not exist on the Rathin side at all, so they answer
    // not_supported even when configured (§16 C1 / A6).
    await expect(port.lookupBooking("x")).resolves.toMatchObject({ outcome: "not_supported" });
    await expect(port.cancelBooking("x", "test")).resolves.toMatchObject({ outcome: "not_supported" });
    expect(port.capabilities()).toMatchObject({ supportsBookingLookup: false, supportsCancellation: false, supportsIdempotency: false });
  });

  it("an unknown adapter string is a configuration error that does not echo the value", () => {
    try {
      supplierFor("rayna", mockEnv);
      expect.unreachable("should throw");
    } catch (e) {
      expect(isAppError(e)).toBe(true);
      if (isAppError(e)) {
        expect(e.code).toBe("NOT_CONFIGURED");
        expect(e.message).not.toContain("rayna");
        expect(e.details).toEqual({ adapter: "rayna" });
      }
    }
  });
});

describe("ManualAdapter", () => {
  const now = () => new Date("2026-09-14T10:00:00.000Z");
  const port = new ManualAdapter(now);

  it("answers unknown availability — ops checks by hand", async () => {
    const av = await port.checkAvailability({ mapping, date: "2026-10-01", pax: booking.pax, timeslot: "16:00" });
    expect(av).toMatchObject({ status: "unknown", spotsLeft: null, source: "manual", capacityIsReliable: false, nextDates: [] });
    expect(av.slots).toEqual([{ time: "16:00", status: "unknown" }]);
    expect(av.checkedAt).toBe("2026-09-14T10:00:00.000Z");
  });

  it("createBooking returns a pending_manual intent and writes nothing", async () => {
    const res = await port.createBooking({ ...booking, expectedNetCostAedMinor: 12_345n, specialRequests: "Jain meal" });
    expect(res.outcome).toBe("pending_manual");
    expect(res.booking).toMatchObject({
      status: "pending_manual",
      supplierRef: null,
      supplierStatus: null,
      tickets: [],
      rawResponse: null,
      idempotencyKey: "order:o1:item:i1",
      supplierId: "s1",
      mappingId: "m1",
    });
    // BigInt is serialised for the JSONB payload; the lead's phone/email are not forwarded.
    expect(res.booking.requestPayload).toMatchObject({ expectedNetCostAedMinor: "12345", leadName: "Test Lead", specialRequests: "Jain meal" });
    expect(JSON.stringify(res.booking.requestPayload)).not.toContain("+919999999999");
  });

  it("lookup and cancel are not_supported", async () => {
    await expect(port.lookupBooking("any")).resolves.toMatchObject({ outcome: "not_supported" });
    await expect(port.cancelBooking("any", "customer request")).resolves.toMatchObject({ outcome: "not_supported" });
    expect(port.capabilities()).toMatchObject({ instantConfirmation: false, supportsBookingLookup: false, hasRealtimeCapacity: false });
  });
});

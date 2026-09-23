import { describe, expect, it } from "vitest";
import { getAvailability, nextAvailableDates } from "@/lib/availability";
import { activities, activityBySlug } from "@/lib/data/activities";
import { idempotencyKeyFor, isSupplierError, type BookingRequest, type SupplierMappingRef } from "../port";
import { RATHIN_CAPABILITIES } from "../rathin/rathin.adapter";
import { RathinMockAdapter } from "../rathin/rathin.mock";

const slug = "burj-khalifa-124-125"; // Tier A, timeslotted, exactly what Rathin would supply
const activity = activityBySlug(slug)!;

const mapping: SupplierMappingRef = {
  mappingId: "m-rathin-1",
  productId: "p1",
  productSlug: slug,
  supplierId: "s-rathin",
  supplierCode: "rathin-tourism",
  adapter: "rathin",
  priority: 1,
  externalRef: { parkId: 82, ticketTypeId: 845, ticketMode: "timed" },
};

const now = () => new Date("2026-09-14T10:00:00.000Z");
const pax = { adult: 2, child: 1, infant: 0, senior: 0 };

function bookingFor(date: string, timeslot?: string): BookingRequest {
  return {
    idempotencyKey: idempotencyKeyFor("order-1", "item-1"),
    orderId: "order-1",
    orderItemId: "item-1",
    orderReference: "OUT-100002",
    mapping,
    serviceDate: date,
    timeslot,
    pax,
    lead: { fullName: "Lead", phoneE164: "+971500000000" },
  };
}

/** First date from `from` whose fixture status matches. Deterministic by construction. */
function findDate(pred: (status: string) => boolean, from = "2026-10-01"): string {
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2026, 9, 1 + i));
    const key = d.toISOString().slice(0, 10);
    if (pred(getAvailability(activity, key).status)) return key;
  }
  throw new Error("no date matched");
}

describe("RathinMockAdapter availability", () => {
  const port = new RathinMockAdapter({ now });

  it("mirrors the storefront getAvailability exactly for the same (slug, date)", async () => {
    const date = findDate((s) => s === "available");
    const expected = getAvailability(activity, date);
    const av = await port.checkAvailability({ mapping, date, pax });
    expect(av.status).toBe(expected.status);
    expect(av.slots.map((s) => [s.time, s.status, s.spotsLeft])).toEqual(expected.slots.map((s) => [s.time, s.status, s.spotsLeft]));
    expect(av.nextDates).toEqual(nextAvailableDates(activity, date));
    expect(av).toMatchObject({ source: "mock", capacityIsReliable: false, checkedAt: "2026-09-14T10:00:00.000Z" });
  });

  it("is deterministic across instances", async () => {
    const date = "2026-11-20";
    const a = await new RathinMockAdapter({ now }).checkAvailability({ mapping, date, pax });
    const b = await new RathinMockAdapter({ now }).checkAvailability({ mapping, date, pax });
    expect(a).toEqual(b);
  });

  it("offers the next three dates when sold out (AC-ADP-02)", async () => {
    const date = findDate((s) => s === "sold_out");
    const av = await port.checkAvailability({ mapping, date, pax });
    expect(av.status).toBe("sold_out");
    expect(av.nextDates).toHaveLength(3);
    for (const d of av.nextDates) expect(getAvailability(activity, d).status).not.toBe("sold_out");
  });

  it("reports quote_only for quote-only fixtures", async () => {
    const quoteOnly = activities.find((a) => a.quoteOnly);
    if (!quoteOnly) return; // fixture set has no quote-only SKU; nothing to assert
    const av = await port.checkAvailability({ mapping: { ...mapping, productSlug: quoteOnly.slug }, date: "2026-11-01", pax });
    expect(av).toMatchObject({ status: "quote_only", slots: [] });
  });

  it("sold_out scenario forces sold out with no slots, like ?mock=sold_out", async () => {
    const forced = new RathinMockAdapter({ now, scenario: "sold_out" });
    const date = findDate((s) => s === "available");
    const av = await forced.checkAvailability({ mapping, date, pax });
    expect(av).toMatchObject({ status: "sold_out", slots: [], spotsLeft: null });
    expect(av.nextDates).toHaveLength(3);
  });

  it("timeout and error scenarios throw a SupplierError carrying the storefront scenario", async () => {
    for (const scenario of ["timeout", "error"] as const) {
      const failing = new RathinMockAdapter({ now, scenario });
      try {
        await failing.checkAvailability({ mapping, date: "2026-11-01", pax });
        expect.unreachable();
      } catch (e) {
        expect(isSupplierError(e)).toBe(true);
        if (isSupplierError(e)) {
          expect(e.code).toBe(scenario);
          expect(e.scenario).toBe(scenario);
          expect(e.supplier).toBe("rathin-mock");
          const app = e.toAppError();
          expect(app.details).toMatchObject({ scenario, supplier: "rathin-mock" });
          expect(app.retryable).toBe(true);
        }
      }
    }
  });

  it("unknown slug is an error, never an invented availability", async () => {
    await expect(port.checkAvailability({ mapping: { ...mapping, productSlug: "does-not-exist" }, date: "2026-11-01", pax })).rejects.toMatchObject({ code: "error" });
  });
});

describe("RathinMockAdapter booking", () => {
  const port = new RathinMockAdapter({ now });

  it("confirms an available date with one ticket per pax and a reference derived from the idempotency key", async () => {
    const date = findDate((s) => s === "available");
    const openSlot = getAvailability(activity, date).slots.find((s) => s.status !== "sold_out")!.time;
    const res = await port.createBooking(bookingFor(date, openSlot));
    expect(res.outcome).toBe("confirmed");
    if (res.outcome !== "confirmed") return;
    expect(res.booking).toMatchObject({ status: "confirmed", supplierStatus: "TICKETED", idempotencyKey: "order:order-1:item:item-1" });
    expect(res.booking.supplierRef).toMatch(/^MOCK-RTN-/);
    expect(res.booking.tickets).toHaveLength(3);
    expect(new Set(res.booking.tickets.map((t) => t.ticketNo)).size).toBe(3);
    // Bare ticket numbers only — no artifact URL, exactly like Rathin (§16 C3).
    for (const t of res.booking.tickets) expect(t.artifactUrl).toBeUndefined();

    const again = await port.createBooking(bookingFor(date, openSlot));
    expect(again.outcome === "confirmed" && again.booking.supplierRef).toBe(res.booking.supplierRef);
  });

  it("rejects a sold-out date with code sold_out and a rejected intent", async () => {
    const date = findDate((s) => s === "sold_out");
    const res = await port.createBooking(bookingFor(date));
    expect(res).toMatchObject({ outcome: "rejected", code: "sold_out" });
    if (res.outcome === "rejected") expect(res.booking.status).toBe("rejected");
  });

  it("rejects a sold-out timeslot even when the day is open", async () => {
    let date: string | undefined;
    let slot: string | undefined;
    for (let i = 0; i < 400 && !date; i++) {
      const key = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      const av = getAvailability(activity, key);
      const dead = av.slots.find((s) => s.status === "sold_out");
      if (av.status !== "sold_out" && dead) {
        date = key;
        slot = dead.time;
      }
    }
    expect(date).toBeDefined();
    const res = await port.createBooking(bookingFor(date!, slot));
    expect(res).toMatchObject({ outcome: "rejected", code: "sold_out" });
  });

  it("price_changed scenario throws the re-consent error", async () => {
    const forced = new RathinMockAdapter({ now, scenario: "price_changed" });
    await expect(forced.createBooking(bookingFor("2026-11-01"))).rejects.toMatchObject({ code: "price_changed", retryable: false });
  });

  it("capabilities are the real Rathin flags, so engine tests exercise the ops-escalation branches", async () => {
    expect(port.capabilities()).toBe(RATHIN_CAPABILITIES);
    expect(port.capabilities()).toMatchObject({ supportsBookingLookup: false, supportsCancellation: false, supportsIdempotency: false, hasRealtimeCapacity: false });
    await expect(port.lookupBooking("MOCK-RTN-X")).resolves.toMatchObject({ outcome: "not_supported" });
    await expect(port.cancelBooking("MOCK-RTN-X", "test")).resolves.toMatchObject({ outcome: "not_supported" });
  });
});

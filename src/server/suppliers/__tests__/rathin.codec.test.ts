import { describe, expect, it } from "vitest";
import { decodePricingKey, fromRathinDate, parseRathinEnvelope, rathinFareToMinor, toRathinDate } from "../rathin/rathin.codec";

describe("parseRathinEnvelope (§16 C4)", () => {
  it("treats the literal status:false GetTicketTypes sample as SUCCESS", () => {
    // Regression fixture from the collection: HTTP 200, data populated, errors null, status false.
    const body = { status: false, responseCode: null, message: "succcessfylly retrieved the record", data: [{ id: 1, parkId: 8, ticketTypeId: 734 }], errors: null };
    const r = parseRathinEnvelope<{ id: number; parkId: number; ticketTypeId: number }[]>(200, body);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0].ticketTypeId).toBe(734);
  });

  it("never trusts status:true when data is missing or errors are present", () => {
    expect(parseRathinEnvelope(200, { status: true, responseCode: "S0001", data: null, errors: null })).toMatchObject({ ok: false, reason: "no_data" });
    expect(parseRathinEnvelope(200, { status: true, data: { id: 1 }, errors: [{ code: "X" }] })).toMatchObject({ ok: false, reason: "errors" });
  });

  it("fails on non-2xx and on malformed bodies", () => {
    expect(parseRathinEnvelope(401, { data: { token: "t" }, errors: null })).toMatchObject({ ok: false, reason: "http", httpStatus: 401 });
    expect(parseRathinEnvelope(200, "not json")).toMatchObject({ ok: false, reason: "malformed" });
    expect(parseRathinEnvelope(200, null)).toMatchObject({ ok: false, reason: "malformed" });
  });
});

describe("dates (§16 C8)", () => {
  it("converts both ways", () => {
    expect(toRathinDate("2023-12-27")).toBe("27-12-2023");
    expect(fromRathinDate("27-12-2023")).toBe("2023-12-27");
    expect(fromRathinDate("12-07-2024 09:30:00")).toBe("2024-07-12"); // bookingDate carries a time
    expect(() => toRathinDate("27-12-2023")).toThrow();
    expect(() => fromRathinDate("2023-12-27")).toThrow();
  });
});

describe("money (§16 C8) — every literal fare in the collection", () => {
  it("converts decimal fares to minor units without float arithmetic", () => {
    expect(rathinFareToMinor("170.00")).toBe(17000n);
    expect(rathinFareToMinor(170)).toBe(17000n);
    expect(rathinFareToMinor("75.00")).toBe(7500n);
    expect(rathinFareToMinor(1998.0)).toBe(199800n);
    expect(rathinFareToMinor("45.00")).toBe(4500n);
    expect(rathinFareToMinor("0.5")).toBe(50n);
    expect(rathinFareToMinor("12.34")).toBe(1234n);
  });
  it("refuses sub-fils precision and garbage", () => {
    expect(() => rathinFareToMinor("1.005")).toThrow();
    expect(() => rathinFareToMinor("AED 170")).toThrow();
    expect(rathinFareToMinor("1.100")).toBe(110n); // trailing zeros are fine
  });
});

describe("decodePricingKey (§16 §1.2)", () => {
  it("decodes the timed and open samples", () => {
    const timed = Buffer.from("82@845@170.00@1@0@12-07-2024@09:30@T@591953").toString("base64");
    expect(decodePricingKey(timed)).toMatchObject({ parkId: "82", ticketTypeId: "845", amount: "170.00", adultCount: "1", childCount: "0", travelDate: "12-07-2024", timeSlot: "09:30" });
    const open = "OEA3MzRANzUuMDBAMUAwQDI3LTEyLTIwMjNA";
    expect(decodePricingKey(open)).toMatchObject({ parkId: "8", ticketTypeId: "734", amount: "75.00", travelDate: "27-12-2023", timeSlot: null });
  });
  it("returns null for anything else", () => {
    expect(decodePricingKey("bm90LWEta2V5")).toBeNull();
  });
});

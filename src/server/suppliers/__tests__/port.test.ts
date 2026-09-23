import { describe, expect, it } from "vitest";
import { idempotencyKeyFor, isSupplierError, parseIdempotencyKey, SupplierError, TIMEOUT_BUDGET_MS, withTimeout } from "../port";

describe("withTimeout", () => {
  it("passes a value through inside the budget", async () => {
    await expect(withTimeout(Promise.resolve(42), 50, "test", "op")).resolves.toBe(42);
  });

  it("rejects with a SupplierError(timeout) on breach and records the budget", async () => {
    const slow = new Promise<number>((r) => setTimeout(() => r(1), 80));
    try {
      await withTimeout(slow, 10, "rathin-live", "createBooking");
      expect.unreachable();
    } catch (e) {
      expect(isSupplierError(e)).toBe(true);
      if (isSupplierError(e)) {
        expect(e.code).toBe("timeout");
        expect(e.details).toEqual({ operation: "createBooking", budgetMs: 10 });
        expect(e.toAppError().status).toBe(504);
      }
    }
  });

  it("propagates the inner rejection unchanged when it comes first", async () => {
    const inner = new SupplierError("sold_out", "x");
    await expect(withTimeout(Promise.reject(inner), 50, "x", "op")).rejects.toBe(inner);
  });

  it("budgets follow §02 §5.2", () => {
    expect(TIMEOUT_BUDGET_MS).toEqual({ availabilityBrowse: 2500, availabilityPrePayment: 6000, createBooking: 45000, lookupBooking: 10000, cancelBooking: 20000 });
  });
});

describe("idempotency key", () => {
  it("round-trips the documented convention", () => {
    const key = idempotencyKeyFor("0192b1c0-aaaa-7000-8000-000000000001", "0192b1c0-bbbb-7000-8000-000000000002");
    expect(key).toBe("order:0192b1c0-aaaa-7000-8000-000000000001:item:0192b1c0-bbbb-7000-8000-000000000002");
    expect(parseIdempotencyKey(key)).toEqual({ orderId: "0192b1c0-aaaa-7000-8000-000000000001", orderItemId: "0192b1c0-bbbb-7000-8000-000000000002" });
    expect(parseIdempotencyKey("nope")).toBeNull();
  });
});

describe("SupplierError envelope", () => {
  it("maps every code to the frontend scenario and a designed recovery line", () => {
    const codes = ["error", "timeout", "sold_out", "price_changed", "supplier_pending", "pickup_unavailable"] as const;
    for (const code of codes) {
      const app = new SupplierError(code, "manual").toAppError();
      expect(app.code).toBe("error");
      expect(app.details).toMatchObject({ scenario: code, supplier: "manual" });
      expect(app.recovery.length).toBeGreaterThan(10);
    }
    expect(new SupplierError("timeout", "x").retryable).toBe(true);
    expect(new SupplierError("sold_out", "x").retryable).toBe(false);
  });
});

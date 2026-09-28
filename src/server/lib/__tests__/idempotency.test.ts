import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "../ids";

/**
 * Duplicate-submission guard, against the real dev database.
 *
 * This is the mechanism that stops a double tap on "Send inquiry" creating two
 * inquiries for two different agents, so the cases that matter are the racy
 * ones, not the happy path.
 */

const enabled = Boolean(process.env.DATABASE_URL);
const SCOPE = `zz-test-idem-${uuidv7().slice(-8)}`;

describe.skipIf(!enabled)("runOnce", () => {
  let prisma: typeof import("../db").prisma;
  let runOnce: typeof import("../idempotency").runOnce;

  beforeAll(async () => {
    ({ prisma } = await import("../db"));
    ({ runOnce } = await import("../idempotency"));
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { scope: SCOPE } });
    await prisma.$disconnect();
  });

  it("runs the work once and replays the first result for the same key", async () => {
    const key = `${SCOPE}:replay`;
    let calls = 0;
    const work = async () => {
      calls++;
      return { reference: "IQ-0001", attempt: calls };
    };

    const first = await runOnce({ key, scope: SCOPE, ttlMs: 60_000, run: work });
    const second = await runOnce({ key, scope: SCOPE, ttlMs: 60_000, run: work });

    expect(calls).toBe(1);
    expect(first.fresh).toBe(true);
    expect(second.fresh).toBe(false);
    // The second caller gets the first caller's answer, not a new inquiry.
    expect(second.value).toEqual(first.value);
  });

  it("treats concurrent callers as one: only one does the work", async () => {
    const key = `${SCOPE}:concurrent`;
    let calls = 0;
    const work = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 120));
      return { reference: "IQ-0002" };
    };

    // The real double tap: both requests in flight at once.
    const results = await Promise.allSettled([
      runOnce({ key, scope: SCOPE, ttlMs: 60_000, run: work }),
      runOnce({ key, scope: SCOPE, ttlMs: 60_000, run: work }),
    ]);

    expect(calls).toBe(1);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    // The loser either waits for the winner's result or is told to retry, but
    // it must never have produced a second row.
    const rejected = results.filter((r) => r.status === "rejected");
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    }
  });

  it("does not poison the key when the work fails, so an honest retry works", async () => {
    const key = `${SCOPE}:failure`;
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error("catalogue unavailable");
      return { reference: "IQ-0003" };
    };

    await expect(runOnce({ key, scope: SCOPE, ttlMs: 60_000, run: flaky })).rejects.toThrow("catalogue unavailable");

    const retry = await runOnce({ key, scope: SCOPE, ttlMs: 60_000, run: flaky });
    expect(retry.fresh).toBe(true);
    expect(retry.value).toEqual({ reference: "IQ-0003" });
    expect(calls).toBe(2);
  });

  it("keeps different keys independent", async () => {
    let calls = 0;
    const work = async () => {
      calls++;
      return { n: calls };
    };
    await runOnce({ key: `${SCOPE}:a`, scope: SCOPE, ttlMs: 60_000, run: work });
    await runOnce({ key: `${SCOPE}:b`, scope: SCOPE, ttlMs: 60_000, run: work });
    expect(calls).toBe(2);
  });
});

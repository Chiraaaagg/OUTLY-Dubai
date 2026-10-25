import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { apiRequest, assertDisposableDb, dbEnabled, runId, siteOrigin } from "../helpers/fixtures";

/**
 * H04 (documented beacon exception) and H08 (abuse limits) for
 * POST /api/events, route level against the local disposable Postgres.
 *
 * Time is controlled: `Date` is faked (only `Date`, so Prisma's timers keep
 * running) and pinned inside one fixed window, so the hourly buckets cannot
 * roll over mid-test. Trusted client IPs are synthetic documentation-range
 * addresses unique to this run.
 */

const run = runId();
const runOctet = (Number.parseInt(run.slice(-2), 16) % 200) + 20;
const ip = (n: number) => `198.18.${runOctet}.${n}`;
const PINNED = new Date("2026-10-25T10:20:00.000Z");

type Prisma = typeof import("@/server/lib/db").prisma;
let prisma: Prisma;
let resetEnvCache: () => void;
let POST: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const saved = { limit: process.env.EVENTS_RATE_LIMIT_PER_HOUR, trust: process.env.TRUST_PROXY_IP_HEADERS };
const ctx = { params: Promise.resolve({}) };
let seq = 0;

function event(extra: Record<string, unknown> = {}) {
  return { event: "page_view", event_id: `zz-sec-${run}-${++seq}`, ts: PINNED.getTime(), page_path: "/", ...extra };
}

function beacon(body: unknown, opts: { ip?: string; aid?: string; contentType?: string | null; origin?: string | null; raw?: BodyInit } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.ip) headers["x-real-ip"] = opts.ip;
  if (opts.aid) headers.cookie = `outlyy_aid=${opts.aid}`;
  if (opts.raw !== undefined) {
    const h = new Headers(headers);
    if (opts.origin !== null) h.set("origin", opts.origin ?? siteOrigin());
    if (opts.contentType) h.set("content-type", opts.contentType);
    return new NextRequest(new URL("/api/events", siteOrigin()), { method: "POST", headers: h, body: opts.raw, duplex: "half" } as unknown as ConstructorParameters<typeof NextRequest>[1]);
  }
  return apiRequest("/api/events", { method: "POST", rawBody: JSON.stringify(body), contentType: opts.contentType === undefined ? "text/plain;charset=UTF-8" : opts.contentType, origin: opts.origin, headers });
}

const ours = () => prisma.analyticsEvent.count({ where: { eventId: { startsWith: `zz-sec-${run}-` } } });

describe.skipIf(!dbEnabled)("POST /api/events", () => {
  beforeAll(async () => {
    assertDisposableDb();
    prisma = (await import("@/server/lib/db")).prisma;
    ({ resetEnvCache } = await import("@/server/lib/env"));
    ({ POST } = await import("@/app/api/events/route"));
    // Buckets in the pinned windows only ever come from these tests; start them empty.
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "events:" }, windowStart: { gte: new Date(PINNED.getTime() - 3600_000), lte: new Date(PINNED.getTime() + 3 * 3600_000) } } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.EVENTS_RATE_LIMIT_PER_HOUR = saved.limit ?? "";
    if (saved.trust === undefined) delete process.env.TRUST_PROXY_IP_HEADERS;
    else process.env.TRUST_PROXY_IP_HEADERS = saved.trust;
    resetEnvCache();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.analyticsEvent.deleteMany({ where: { eventId: { startsWith: `zz-sec-${run}-` } } });
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "events:" }, windowStart: { lte: new Date(PINNED.getTime() + 3 * 3600_000), gte: new Date(PINNED.getTime() - 3600_000) } } });
  });

  function pinClock(at = PINNED) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
  }

  describe("H04 beacon exception", () => {
    it("accepts a same-origin text/plain beacon (sendBeacon's only string type)", async () => {
      const before = await ours();
      const res = await POST(beacon([event()]), ctx);
      expect(res.status).toBe(204);
      expect(res.headers.get("x-events-accepted")).toBe("1");
      expect(await ours()).toBe(before + 1);
    });

    it("accepts application/json (Blob beacon / keepalive fetch)", async () => {
      const res = await POST(beacon([event()], { contentType: "application/json" }), ctx);
      expect(res.status).toBe(204);
      expect(res.headers.get("x-events-accepted")).toBe("1");
    });

    for (const ct of ["application/x-www-form-urlencoded", "multipart/form-data; boundary=x", null]) {
      it(`refuses ${ct ?? "a missing"} content type with 415 and stores nothing`, async () => {
        const before = await ours();
        // A string body gets text/plain by default; bytes carry no content type at all.
        const req = ct === null ? beacon(null, { raw: new TextEncoder().encode(JSON.stringify([event()])), contentType: null }) : beacon([event()], { contentType: ct });
        const res = await POST(req, ctx);
        expect(res.status).toBe(415);
        expect(await ours()).toBe(before);
      });
    }

    for (const [label, origin] of [["foreign", "https://evil.example"], ["null", "null"], ["missing", null]] as const) {
      it(`refuses a ${label} Origin even for text/plain`, async () => {
        const before = await ours();
        const res = await POST(beacon([event()], { origin }), ctx);
        expect(res.status).toBe(403);
        expect(await ours()).toBe(before);
      });
    }

    it("reads at most 64 KiB, whatever Content-Length says (413)", async () => {
      let sent = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(c) {
          if (sent > 70 * 1024) return c.close();
          sent += 8192;
          c.enqueue(new Uint8Array(8192).fill(0x20));
        },
      });
      const res = await POST(beacon(null, { raw: stream, contentType: "text/plain" }), ctx);
      expect(res.status).toBe(413);
    });

    it("keeps the batch cap: events beyond 50 per request are rejected", async () => {
      const batch = Array.from({ length: 51 }, () => event());
      const res = await POST(beacon(batch), ctx);
      // Development is strict (422); production would answer 204 with the overflow counted as rejected.
      expect([204, 422]).toContain(res.status);
      if (res.status === 204) expect(res.headers.get("x-events-rejected")).toBe("1");
    });
  });

  describe("H08 limits a client cannot reset", () => {
    it("rotating outlyy_aid does not escape the per-IP quota", async () => {
      process.env.EVENTS_RATE_LIMIT_PER_HOUR = "3";
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      resetEnvCache();
      pinClock();
      const { EVENTS_IP_QUOTA_MULTIPLIER } = await import("@/server/schemas/events.schemas");
      const quota = 3 * EVENTS_IP_QUOTA_MULTIPLIER;
      for (let i = 0; i < quota; i++) {
        const res = await POST(beacon([event()], { ip: ip(1), aid: `aid${run}rot${i}` }), ctx);
        expect(res.status, `request ${i + 1} of ${quota}`).toBe(204);
      }
      const over = await POST(beacon([event()], { ip: ip(1), aid: `aid${run}rotX` }), ctx);
      expect(over.status).toBe(429);
      expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
      // Payload-supplied ids do not help either.
      const viaPayload = await POST(beacon([event({ anon_id: `aid${run}payload`, session_id: `sid${run}payload` })], { ip: ip(1) }), ctx);
      expect(viaPayload.status).toBe(429);
      // Another visitor on another IP is unaffected.
      expect((await POST(beacon([event()], { ip: ip(2), aid: `aid${run}other` }), ctx)).status).toBe(204);
    });

    it("keeps the per-identity quota for one anon id", async () => {
      process.env.EVENTS_RATE_LIMIT_PER_HOUR = "3";
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      resetEnvCache();
      pinClock();
      for (let i = 0; i < 3; i++) expect((await POST(beacon([event()], { ip: ip(3), aid: `aid${run}same` }), ctx)).status).toBe(204);
      expect((await POST(beacon([event()], { ip: ip(3), aid: `aid${run}same` }), ctx)).status).toBe(429);
    });

    it("both quotas reset in the next window", async () => {
      process.env.EVENTS_RATE_LIMIT_PER_HOUR = "3";
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      resetEnvCache();
      pinClock();
      for (let i = 0; i < 3; i++) await POST(beacon([event()], { ip: ip(4), aid: `aid${run}win` }), ctx);
      expect((await POST(beacon([event()], { ip: ip(4), aid: `aid${run}win` }), ctx)).status).toBe(429);
      vi.setSystemTime(new Date(PINNED.getTime() + 3600_000));
      expect((await POST(beacon([event({ ts: PINNED.getTime() + 3600_000 })], { ip: ip(4), aid: `aid${run}win` }), ctx)).status).toBe(204);
    });

    it("enforces a per-instance ceiling regardless of identity", async () => {
      const { EVENTS_INSTANCE_LIMIT_PER_MINUTE } = await import("@/server/schemas/events.schemas");
      // A minute of its own, so earlier tests' requests are not in this window.
      pinClock(new Date(PINNED.getTime() + 2 * 3600_000));
      // Empty beacons are refused at validation (422) without touching the
      // database, which keeps this loop cheap; they still count toward the ceiling.
      let last = 0;
      for (let i = 0; i <= EVENTS_INSTANCE_LIMIT_PER_MINUTE; i++) {
        last = (await POST(beacon(null, { raw: "", contentType: "text/plain" }), ctx)).status;
        if (last === 429) break;
      }
      expect(last).toBe(429);
    });
  });
});

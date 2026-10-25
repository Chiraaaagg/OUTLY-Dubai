import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { apiRequest, assertDisposableDb, cleanupPeople, createStaff, dbEnabled, params, runId, syntheticPhone, type StaffFixture } from "../helpers/fixtures";
import { uuidv7 } from "@/server/lib/ids";

/**
 * H09 / G07 — limiter failure policy and thresholds, route level, against
 * the local disposable Postgres. SMS stays on the `log` adapter (no
 * provider is called); every phone number is synthetic.
 *
 * "Store outage" below is SIMULATED: `prisma.$queryRaw` (the limiter's only
 * query) is made to reject for the duration of one test, then restored.
 * Nothing about the real database changes.
 *
 * Thresholds run under a pinned clock (`Date` only is faked) inside one
 * fixed window, so Retry-After is exact and buckets cannot roll over mid-test.
 */

const run = runId();
const runOctet = (Number.parseInt(run.slice(-2), 16) % 200) + 20;
const ip = (n: number) => `198.18.${runOctet}.${100 + n}`;
/** 10:20:00Z — 10 minutes into a 15-minute window, 20 into an hour. */
const PINNED = new Date("2026-10-25T10:20:00.000Z");

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
let prisma: typeof import("@/server/lib/db").prisma;
let resetEnvCache: () => void;
let staff: StaffFixture;
const saved = { ...process.env };
const ctx = params({});

function restoreEnv(keys: string[]) {
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvCache();
}
const TOUCHED = ["TRUST_PROXY_IP_HEADERS", "EVENTS_RATE_LIMIT_PER_HOUR", "SMS_PROVIDER", "MSG91_AUTH_KEY", "NEXT_PUBLIC_MSG91_WIDGET_ID", "NEXT_PUBLIC_MSG91_WIDGET_TOKEN"];

async function route(load: () => Promise<Record<string, unknown>>, method = "POST"): Promise<Handler> {
  return (await load())[method] as Handler;
}

function post(path: string, body: unknown, opts: { ip?: string; cookie?: string; headers?: Record<string, string> } = {}) {
  return apiRequest(path, { method: "POST", body, cookie: opts.cookie, headers: { ...(opts.ip ? { "x-real-ip": opts.ip } : {}), ...(opts.headers ?? {}) } });
}

/** SIMULATED limiter-store outage: the rate limiter's upsert rejects; everything else still reaches Postgres. */
function simulateLimiterOutage() {
  return vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("simulated limiter store outage (test)"));
}

async function expectUnavailable(res: Response) {
  expect(res.status).toBe(503);
  const body = await res.json();
  expect(body.error.code).toBe("UNAVAILABLE");
  expect(body.error.retryable).toBe(true);
  expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
}

describe.skipIf(!dbEnabled)("rate limits (H09/G07)", () => {
  beforeAll(async () => {
    assertDisposableDb();
    prisma = (await import("@/server/lib/db")).prisma;
    ({ resetEnvCache } = await import("@/server/lib/env"));
    staff = await createStaff(run, "rl", ["admin"]);
    // Buckets in the pinned windows only ever come from these tests; start them empty.
    await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { gte: new Date(PINNED.getTime() - 3600_000), lte: new Date(PINNED.getTime() + 6 * 3600_000) }, NOT: { key: { startsWith: "events:" } } } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreEnv(TOUCHED);
  });

  afterAll(async () => {
    if (!prisma) return;
    const phones = Array.from({ length: 20 }, (_, i) => syntheticPhone(run, i));
    await prisma.otpChallenge.deleteMany({ where: { phoneE164: { in: phones } } });
    await prisma.analyticsEvent.deleteMany({ where: { eventId: { startsWith: `zz-sec-${run}-` } } });
    await cleanupPeople(run);
  });

  describe("fail closed when the limiter store is down (simulated outage)", () => {
    it("OTP request → 503 UNAVAILABLE + Retry-After, no code issued", async () => {
      const POST = await route(() => import("@/app/api/auth/otp/request/route"));
      const phone = syntheticPhone(run, 1);
      const spy = simulateLimiterOutage();
      await expectUnavailable(await POST(post("/api/auth/otp/request", { phone: phone.slice(3), countryCode: "+91" }), ctx));
      spy.mockRestore();
      expect(await prisma.otpChallenge.count({ where: { phoneE164: phone } })).toBe(0);
    });

    it("OTP verify → 503", async () => {
      const POST = await route(() => import("@/app/api/auth/otp/verify/route"));
      simulateLimiterOutage();
      await expectUnavailable(await POST(post("/api/auth/otp/verify", { challengeId: uuidv7(), code: "123456" }), ctx));
    });

    it("widget verify → 503 before any provider call", async () => {
      process.env.SMS_PROVIDER = "msg91_widget";
      process.env.MSG91_AUTH_KEY = "fake-local-key";
      process.env.NEXT_PUBLIC_MSG91_WIDGET_ID = "fake-widget";
      process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN = "fake-token";
      resetEnvCache();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network is not allowed in this test"));
      const POST = await route(() => import("@/app/api/auth/otp/widget/route"));
      simulateLimiterOutage();
      await expectUnavailable(await POST(post("/api/auth/otp/widget", { accessToken: "x".repeat(32) }), ctx));
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("admin login → 503, and no password check happens", async () => {
      const POST = await route(() => import("@/app/api/admin/auth/login/route"));
      simulateLimiterOutage();
      await expectUnavailable(await POST(post("/api/admin/auth/login", { email: staff.email, password: "wrong-password-123" }), ctx));
      const row = await prisma.adminUser.findUnique({ where: { id: staff.id } });
      expect(row?.failedLoginCount).toBe(0);
    });

    it("admin TOTP verify → 503", async () => {
      const { signPendingToken, PENDING_COOKIE } = await import("@/server/lib/session");
      const pending = await signPendingToken({ sub: staff.id, stage: "totp" });
      const POST = await route(() => import("@/app/api/admin/auth/totp/verify/route"));
      simulateLimiterOutage();
      await expectUnavailable(await POST(post("/api/admin/auth/totp/verify", { code: "123456" }, { cookie: `${PENDING_COOKIE}=${pending}` }), ctx));
    });

    it("inquiry submission → 503, nothing created", async () => {
      const POST = await route(() => import("@/app/api/inquiries/route"));
      const before = await prisma.inquiry.count();
      simulateLimiterOutage();
      const body = { items: [], leadName: "Zz Fixture", leadPhone: syntheticPhone(run, 2).slice(3), countryCode: "+91", datesFlexible: true, currency: "INR", source: "inquiry_form", whatsappConsent: true };
      await expectUnavailable(await POST(post("/api/inquiries", body), ctx));
      expect(await prisma.inquiry.count()).toBe(before);
    });

    it("reference lookup → 503", async () => {
      const POST = await route(() => import("@/app/api/inquiries/lookup/route"));
      simulateLimiterOutage();
      await expectUnavailable(await POST(post("/api/inquiries/lookup", { reference: "INQ-ZZ0001", phone: "9999999999" }), ctx));
    });

    it("heavy admin write (import fetch) → 503", async () => {
      const POST = await route(() => import("@/app/api/admin/imports/fetch/route"));
      simulateLimiterOutage();
      await expectUnavailable(await POST(post("/api/admin/imports/fetch", { url: "https://docs.google.com/spreadsheets/d/zz/edit" }, { cookie: staff.cookie }), ctx));
    });

    it("analytics events stay available, within the same budget held in memory (fail open)", async () => {
      process.env.EVENTS_RATE_LIMIT_PER_HOUR = "3";
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      resetEnvCache();
      const POST = await route(() => import("@/app/api/events/route"));
      simulateLimiterOutage();
      const send = (n: number) =>
        POST(apiRequest("/api/events", { rawBody: JSON.stringify([{ event: "page_view", event_id: `zz-sec-${run}-out${n}`, page_path: "/" }]), contentType: "text/plain", headers: { "x-real-ip": ip(50), cookie: `outlyy_aid=aid${run}outage` } }), ctx);
      for (let i = 0; i < 3; i++) expect((await send(i)).status).toBe(204);
      expect((await send(3)).status).toBe(429);
      expect(await prisma.analyticsEvent.count({ where: { eventId: { startsWith: `zz-sec-${run}-out` } } })).toBe(3);
    });

    it("recovers as soon as the store is back", async () => {
      const otp = await route(() => import("@/app/api/auth/otp/request/route"));
      const login = await route(() => import("@/app/api/admin/auth/login/route"));
      const spy = simulateLimiterOutage();
      await expectUnavailable(await otp(post("/api/auth/otp/request", { phone: syntheticPhone(run, 3).slice(3), countryCode: "+91" }, { ip: ip(60) }), ctx));
      spy.mockRestore();
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      expect((await otp(post("/api/auth/otp/request", { phone: syntheticPhone(run, 3).slice(3), countryCode: "+91" }, { ip: ip(60) }), ctx)).status).toBe(200);
      const res = await login(post("/api/admin/auth/login", { email: `zz-sec-${run}-nobody@outlyy.test`, password: "wrong-password-123" }, { ip: ip(60) }), ctx);
      expect(res.status).toBe(401);
    });
  });

  describe("OTP request thresholds (pinned clock, log SMS adapter)", () => {
    function pin() {
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      resetEnvCache();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(PINNED);
    }

    it("per phone: below and at the limit pass, above is 429 with the exact Retry-After", async () => {
      pin();
      const { env } = await import("@/server/lib/env");
      const limit = env().OTP_RATE_LIMIT_PER_PHONE_PER_15MIN;
      expect(limit).toBeGreaterThan(0);
      const POST = await route(() => import("@/app/api/auth/otp/request/route"));
      const phone = syntheticPhone(run, 4).slice(3);
      // Different IP each time: only the phone key can be what trips.
      for (let i = 0; i < limit; i++) expect((await POST(post("/api/auth/otp/request", { phone, countryCode: "+91" }, { ip: ip(i) }), ctx)).status, `request ${i + 1}`).toBe(200);
      const over = await POST(post("/api/auth/otp/request", { phone, countryCode: "+91" }, { ip: ip(limit) }), ctx);
      expect(over.status).toBe(429);
      expect((await over.json()).error.code).toBe("RATE_LIMITED");
      expect(over.headers.get("retry-after")).toBe("600");
    });

    it("per IP: independent of the phone key — many phones from one IP trip it", async () => {
      pin();
      const { env } = await import("@/server/lib/env");
      const limit = env().OTP_RATE_LIMIT_PER_IP_PER_HOUR;
      expect(limit).toBeLessThanOrEqual(15);
      const POST = await route(() => import("@/app/api/auth/otp/request/route"));
      const theIp = ip(30);
      // Phones 5.. are fresh each time, so only the IP key accumulates.
      for (let i = 0; i < limit; i++) {
        const phone = syntheticPhone(run, 5 + (i % 10)).slice(3);
        const res = await POST(post("/api/auth/otp/request", { phone, countryCode: "+91" }, { ip: theIp }), ctx);
        expect(res.status, `request ${i + 1}`).toBe(200);
      }
      const over = await POST(post("/api/auth/otp/request", { phone: syntheticPhone(run, 16).slice(3), countryCode: "+91" }, { ip: theIp }), ctx);
      expect(over.status).toBe(429);
      expect(over.headers.get("retry-after")).toBe("2400");
      // The same fresh phone from another IP is fine.
      expect((await POST(post("/api/auth/otp/request", { phone: syntheticPhone(run, 16).slice(3), countryCode: "+91" }, { ip: ip(31) }), ctx)).status).toBe(200);
    });

    it("without a trusted IP, every caller shares one bucket (never unlimited)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      // A different hour, so earlier tests' buckets are not involved.
      vi.setSystemTime(new Date(PINNED.getTime() + 5 * 3600_000));
      delete process.env.TRUST_PROXY_IP_HEADERS;
      resetEnvCache();
      const { env } = await import("@/server/lib/env");
      const limit = env().OTP_RATE_LIMIT_PER_IP_PER_HOUR;
      const POST = await route(() => import("@/app/api/auth/otp/request/route"));
      // Spoofed forwarding headers are ignored when nothing vouches for them.
      let last = 0;
      for (let i = 0; i <= limit; i++) {
        const phone = syntheticPhone(run, (i % 18) + 1).slice(3);
        last = (await POST(post("/api/auth/otp/request", { phone, countryCode: "+91" }, { headers: { "x-forwarded-for": `192.0.2.${i + 1}`, "x-real-ip": `192.0.2.${i + 1}` } }), ctx)).status;
        if (last === 429) break;
      }
      expect(last).toBe(429);
      await prisma.rateLimitBucket.deleteMany({ where: { key: "otp_request:ip:none" } });
    });
  });

  describe("admin login thresholds", () => {
    it("per email: at the limit still 401, above is 429 + Retry-After", async () => {
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      resetEnvCache();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(PINNED);
      const { env } = await import("@/server/lib/env");
      const limit = env().ADMIN_LOGIN_RATE_LIMIT_PER_15MIN;
      const POST = await route(() => import("@/app/api/admin/auth/login/route"));
      const email = `zz-sec-${run}-limit@outlyy.test`;
      for (let i = 0; i < limit; i++) expect((await POST(post("/api/admin/auth/login", { email, password: "wrong-password-123" }, { ip: ip(70 + i) }), ctx)).status).toBe(401);
      const over = await POST(post("/api/admin/auth/login", { email, password: "wrong-password-123" }, { ip: ip(90) }), ctx);
      expect(over.status).toBe(429);
      expect(over.headers.get("retry-after")).toBe("600");
    });
  });
});

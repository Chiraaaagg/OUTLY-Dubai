import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SignJWT } from "jose";
import {
  apiRequest,
  assertDisposableDb,
  cleanupPeople,
  createCustomer,
  createStaff,
  dbEnabled,
  params,
  runId,
  syntheticPhone,
} from "../helpers/fixtures";

/**
 * H11 / G02 / family C — admin and customer session lifecycle, route level,
 * against the local disposable Postgres with synthetic accounts.
 *
 * Admin: HS256 JWT bound to an `admin_sessions` row. Pinned algorithm,
 * issuer/audience separation between pending and session tokens, database
 * checks on every request (revoked, expired, suspended, deleted, sub/sid
 * mismatch), permissions read from the database (a role downgrade bites on
 * the next request), and single use of a TOTP code.
 *
 * Customer: opaque random token, only its SHA-256 stored, expiry, logout
 * revocation, closed accounts, and the phone always coming from the proof
 * (OTP challenge) — never from the request body.
 */

const run = runId();
const ctx = params({});
const savedTrust = process.env.TRUST_PROXY_IP_HEADERS;
/** Unique trusted IP per run so the OTP per-IP buckets start empty. */
const IP = { "x-real-ip": `198.19.${(Number.parseInt(run.slice(-2), 16) % 200) + 20}.77` };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
let prisma: typeof import("@/server/lib/db").prisma;
let SESSION_COOKIE: string;
let PENDING_COOKIE: string;
let CUSTOMER_COOKIE: string;

async function handler(load: () => Promise<Record<string, unknown>>, method = "GET"): Promise<Handler> {
  return (await load())[method] as Handler;
}
const adminMe = () => handler(() => import("@/app/api/admin/auth/me/route"));
const adminUsers = () => handler(() => import("@/app/api/admin/users/route"));
const totpVerify = () => handler(() => import("@/app/api/admin/auth/totp/verify/route"), "POST");
const customerMe = () => handler(() => import("@/app/api/auth/me/route"));

async function jwtKey(): Promise<Uint8Array> {
  const { env } = await import("@/server/lib/env");
  return new TextEncoder().encode(env().AUTH_JWT_SECRET);
}

function b64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}

/** RFC 6238 code for a base32 secret, computed independently of the app's helper. */
async function totpCode(secretB32: string, at = Date.now()): Promise<string> {
  const { base32Decode } = await import("@/server/lib/crypto");
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

function setCookies(res: Response): string[] {
  return (res.headers as Headers & { getSetCookie(): string[] }).getSetCookie();
}

describe.skipIf(!dbEnabled)("auth and sessions (H11/G02)", () => {
  beforeAll(async () => {
    assertDisposableDb();
    prisma = (await import("@/server/lib/db")).prisma;
    ({ SESSION_COOKIE, PENDING_COOKIE } = await import("@/server/lib/session"));
    ({ CUSTOMER_COOKIE } = await import("@/server/lib/customer-session"));
    process.env.TRUST_PROXY_IP_HEADERS = "true";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (savedTrust === undefined) delete process.env.TRUST_PROXY_IP_HEADERS;
    else process.env.TRUST_PROXY_IP_HEADERS = savedTrust;
    if (!prisma) return;
    const phones = Array.from({ length: 10 }, (_, i) => syntheticPhone(run, 40 + i));
    await prisma.otpChallenge.deleteMany({ where: { phoneE164: { in: phones } } });
    await prisma.customer.deleteMany({ where: { phoneE164: { in: phones } } });
    await cleanupPeople(run);
  });

  /* ---------------------------------------------------------------- admin */

  describe("admin JWT", () => {
    it("a live session works (control)", async () => {
      const s = await createStaff(run, "ctl", ["admin"]);
      expect((await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: s.cookie }), ctx)).status).toBe(200);
    });

    it("a pending (pre-TOTP) token is never accepted as a session", async () => {
      const s = await createStaff(run, "pend", ["admin"]);
      const { signPendingToken } = await import("@/server/lib/session");
      const pending = await signPendingToken({ sub: s.id, stage: "totp" });
      const res = await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: `${SESSION_COOKIE}=${pending}` }), ctx);
      expect(res.status).toBe(401);
    });

    it("a session token is never accepted as a pending token", async () => {
      const s = await createStaff(run, "sess", ["admin"]);
      const res = await (await totpVerify())(apiRequest("/api/admin/auth/totp/verify", { body: { code: "123456" }, cookie: `${PENDING_COOKIE}=${s.token}` }), ctx);
      expect(res.status).toBe(401);
    });

    it("refuses tokens signed with another algorithm, alg=none, or the wrong issuer, even with the right secret and a live sid", async () => {
      const s = await createStaff(run, "alg", ["admin"]);
      const key = await jwtKey();
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const hs512 = await new SignJWT({ sid: s.sessionId }).setProtectedHeader({ alg: "HS512" }).setSubject(s.id).setIssuer("outlyy-admin").setAudience("session").setExpirationTime(exp).sign(key);
      const none = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sid: s.sessionId, sub: s.id, iss: "outlyy-admin", aud: "session", exp })}.`;
      const wrongIss = await new SignJWT({ sid: s.sessionId }).setProtectedHeader({ alg: "HS256" }).setSubject(s.id).setIssuer("someone-else").setAudience("session").setExpirationTime(exp).sign(key);
      const { verifySessionToken } = await import("@/server/lib/session");
      expect(await verifySessionToken(hs512)).toBeNull();
      expect(await verifySessionToken(none)).toBeNull();
      expect(await verifySessionToken(wrongIss)).toBeNull();
      for (const t of [hs512, none, wrongIss]) {
        expect((await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: `${SESSION_COOKIE}=${t}` }), ctx)).status).toBe(401);
      }
    });

    it("a token whose sub does not own the sid is refused", async () => {
      const a = await createStaff(run, "own-a", ["admin"]);
      const b = await createStaff(run, "own-b", ["readonly"]);
      const key = await jwtKey();
      const forged = await new SignJWT({ sid: b.sessionId }).setProtectedHeader({ alg: "HS256" }).setSubject(a.id).setIssuer("outlyy-admin").setAudience("session").setExpirationTime("1h").sign(key);
      expect((await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: `${SESSION_COOKIE}=${forged}` }), ctx)).status).toBe(401);
    });
  });

  describe("admin session database checks", () => {
    it("revoked session → 401", async () => {
      const s = await createStaff(run, "rev", ["admin"]);
      await prisma.adminSession.update({ where: { id: s.sessionId }, data: { revokedAt: new Date() } });
      expect((await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: s.cookie }), ctx)).status).toBe(401);
    });

    it("expired session row → 401 even though the JWT itself is still valid", async () => {
      const s = await createStaff(run, "exp", ["admin"]);
      await prisma.adminSession.update({ where: { id: s.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: s.cookie }), ctx)).status).toBe(401);
    });

    it("suspended user → existing session stops working", async () => {
      const s = await createStaff(run, "susp", ["admin"]);
      await prisma.adminUser.update({ where: { id: s.id }, data: { status: "suspended" } });
      expect((await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: s.cookie }), ctx)).status).toBe(401);
    });

    it("deleted user → existing session stops working", async () => {
      const s = await createStaff(run, "del", ["admin"]);
      await prisma.adminUser.update({ where: { id: s.id }, data: { deletedAt: new Date() } });
      expect((await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: s.cookie }), ctx)).status).toBe(401);
    });

    it("role downgrade takes effect on the very next request with the same session", async () => {
      const s = await createStaff(run, "down", ["admin"]);
      const GET = await adminUsers();
      expect((await GET(apiRequest("/api/admin/users", { cookie: s.cookie }), ctx)).status).toBe(200);
      const readonly = await prisma.role.findUniqueOrThrow({ where: { code: "readonly" } });
      await prisma.adminUserRole.deleteMany({ where: { adminUserId: s.id } });
      await prisma.adminUserRole.create({ data: { adminUserId: s.id, roleId: readonly.id } });
      expect((await GET(apiRequest("/api/admin/users", { cookie: s.cookie }), ctx)).status).toBe(403);
    });

    it("a user without TOTP enrolled holds no permissions, even with a session", async () => {
      const s = await createStaff(run, "nototp", ["admin"], { totpEnabled: false });
      expect((await (await adminUsers())(apiRequest("/api/admin/users", { cookie: s.cookie }), ctx)).status).toBe(403);
    });

    it("logout revokes the session row", async () => {
      const s = await createStaff(run, "out", ["admin"]);
      const POST = await handler(() => import("@/app/api/admin/auth/logout/route"), "POST");
      expect((await POST(apiRequest("/api/admin/auth/logout", { method: "POST", cookie: s.cookie }), ctx)).status).toBe(200);
      expect((await prisma.adminSession.findUnique({ where: { id: s.sessionId } }))?.revokedAt).not.toBeNull();
      expect((await (await adminMe())(apiRequest("/api/admin/auth/me", { cookie: s.cookie }), ctx)).status).toBe(401);
    });

    it("the audit IP hash comes from the trusted-proxy contract, not a spoofed header", async () => {
      const s = await createStaff(run, "iph", ["admin"]);
      const { authService } = await import("@/server/services/auth.service");
      const { hashIp } = await import("@/server/lib/crypto");
      const saved = process.env.TRUST_PROXY_IP_HEADERS;
      try {
        delete process.env.TRUST_PROXY_IP_HEADERS;
        const spoofed = await authService.resolveRequest(apiRequest("/api/admin/auth/me", { cookie: s.cookie, headers: { "x-forwarded-for": "192.0.2.77" } }));
        expect(spoofed?.actor.ipHash).toBeUndefined();
        process.env.TRUST_PROXY_IP_HEADERS = "true";
        const trusted = await authService.resolveRequest(apiRequest("/api/admin/auth/me", { cookie: s.cookie, headers: { "x-real-ip": "192.0.2.78" } }));
        expect(trusted?.actor.ipHash).toBe(hashIp("192.0.2.78"));
      } finally {
        if (saved === undefined) delete process.env.TRUST_PROXY_IP_HEADERS;
        else process.env.TRUST_PROXY_IP_HEADERS = saved;
      }
    });
  });

  describe("TOTP", () => {
    async function enrolled(label: string) {
      const s = await createStaff(run, label, ["admin"]);
      const { encryptSecret, generateTotpSecret } = await import("@/server/lib/crypto");
      const secret = generateTotpSecret();
      await prisma.adminUser.update({ where: { id: s.id }, data: { totpSecretEncrypted: encryptSecret(secret) } });
      const { signPendingToken } = await import("@/server/lib/session");
      const pending = async () => `${PENDING_COOKIE}=${await signPendingToken({ sub: s.id, stage: "totp" })}`;
      return { s, secret, pending };
    }

    it("a correct code mints a session with hardened cookie flags; the same code cannot be used again", async () => {
      const { s, secret, pending } = await enrolled("totp");
      const POST = await totpVerify();
      const code = await totpCode(secret);
      const first = await POST(apiRequest("/api/admin/auth/totp/verify", { body: { code }, cookie: await pending() }), ctx);
      expect(first.status).toBe(200);
      const cookie = setCookies(first).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).toMatch(/Path=\//);

      const replay = await POST(apiRequest("/api/admin/auth/totp/verify", { body: { code }, cookie: await pending() }), ctx);
      expect(replay.status).toBe(401);
      expect((await replay.json()).error.message).toMatch(/already used/i);
      const replayAudit = await prisma.auditLog.count({ where: { action: "auth.totp_replayed", entityId: s.id } });
      expect(replayAudit).toBe(1);
    });

    it("two concurrent submissions of one code mint exactly one session", async () => {
      const { s, secret, pending } = await enrolled("race");
      const POST = await totpVerify();
      const code = await totpCode(secret);
      const before = await prisma.adminSession.count({ where: { adminUserId: s.id } });
      const results = await Promise.all([0, 1].map(async () => POST(apiRequest("/api/admin/auth/totp/verify", { body: { code }, cookie: await pending() }), ctx)));
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
      expect(await prisma.adminSession.count({ where: { adminUserId: s.id } })).toBe(before + 1);
    });

    it("a wrong code is refused and audited", async () => {
      const { s, secret, pending } = await enrolled("wrong");
      const good = await totpCode(secret);
      const bad = good === "000000" ? "000001" : "000000";
      const res = await (await totpVerify())(apiRequest("/api/admin/auth/totp/verify", { body: { code: bad }, cookie: await pending() }), ctx);
      expect(res.status).toBe(401);
      expect(await prisma.auditLog.count({ where: { action: "auth.totp_failed", entityId: s.id } })).toBe(1);
    });

    it("cookies are Secure in a production build even if APP_ENV was left at development", async () => {
      const { setSessionCookie } = await import("@/server/lib/session");
      const envObj = process.env as Record<string, string | undefined>;
      const saved = envObj.NODE_ENV;
      try {
        envObj.NODE_ENV = "production";
        const res = NextResponse.json({});
        setSessionCookie(res, "t".repeat(20), new Date(Date.now() + 60_000));
        expect(setCookies(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`))).toMatch(/Secure/);
      } finally {
        envObj.NODE_ENV = saved;
      }
    });
  });

  /* ------------------------------------------------------------- customer */

  describe("customer OTP sessions", () => {
    async function signIn(phone: string) {
      const { log } = await import("@/server/lib/logger");
      const debug = vi.spyOn(log, "debug");
      const reqOtp = await handler(() => import("@/app/api/auth/otp/request/route"), "POST");
      const verify = await handler(() => import("@/app/api/auth/otp/verify/route"), "POST");
      const r1 = await reqOtp(apiRequest("/api/auth/otp/request", { body: { phone: phone.slice(3), countryCode: "+91" }, headers: IP }), ctx);
      expect(r1.status).toBe(200);
      const { challengeId } = await r1.json();
      const logged = debug.mock.calls.find(([m]) => String(m).startsWith("sms.log_adapter.otp_code"));
      const code = String((logged?.[1] as { devOtpCode?: string })?.devOtpCode);
      expect(code).toMatch(/^\d{6}$/);
      debug.mockRestore();
      const r2 = await verify(apiRequest("/api/auth/otp/verify", { body: { challengeId, code }, headers: IP }), ctx);
      return { r2, challengeId, code, verify };
    }

    it("mints a 256-bit opaque token, stores only its SHA-256, and sets httpOnly cookies", async () => {
      const phone = syntheticPhone(run, 40);
      const { r2 } = await signIn(phone);
      expect(r2.status).toBe(200);
      const cookies = setCookies(r2);
      const session = cookies.find((c) => c.startsWith(`${CUSTOMER_COOKIE}=`))!;
      const hint = cookies.find((c) => c.startsWith("outlyy_customer="))!;
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=lax/i);
      expect(hint).not.toMatch(/HttpOnly/i);
      expect(hint).toMatch(/^outlyy_customer=1;/);
      const token = decodeURIComponent(session.split(";")[0].split("=")[1]);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      const customer = await prisma.customer.findUniqueOrThrow({ where: { phoneE164: phone } });
      const rows = await prisma.customerSession.findMany({ where: { customerId: customer.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
      expect(JSON.stringify(rows[0])).not.toContain(token);
      expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect((await (await customerMe())(apiRequest("/api/auth/me", { cookie: `${CUSTOMER_COOKIE}=${token}` }), ctx)).status).toBe(200);
    });

    it("a used code cannot be replayed", async () => {
      const { r2, challengeId, code, verify } = await signIn(syntheticPhone(run, 41));
      expect(r2.status).toBe(200);
      const again = await verify(apiRequest("/api/auth/otp/verify", { body: { challengeId, code }, headers: IP }), ctx);
      expect(again.status).toBe(401);
    });

    it("the verify body cannot name a phone: the account is the one the challenge proved", async () => {
      const { challengeId } = await (async () => {
        const reqOtp = await handler(() => import("@/app/api/auth/otp/request/route"), "POST");
        return (await reqOtp(apiRequest("/api/auth/otp/request", { body: { phone: syntheticPhone(run, 42).slice(3), countryCode: "+91" }, headers: IP }), ctx)).json();
      })();
      const verify = await handler(() => import("@/app/api/auth/otp/verify/route"), "POST");
      const res = await verify(apiRequest("/api/auth/otp/verify", { body: { challengeId, code: "123456", phone: syntheticPhone(run, 43) }, headers: IP }), ctx);
      expect(res.status).toBe(422);
      expect(await prisma.customer.count({ where: { phoneE164: syntheticPhone(run, 43) } })).toBe(0);
    });

    it("a signed-in customer cannot file an inquiry under a different phone", async () => {
      const c = await createCustomer(run, syntheticPhone(run, 44));
      const POST = await handler(() => import("@/app/api/inquiries/route"), "POST");
      const before = await prisma.inquiry.count();
      const res = await POST(
        apiRequest("/api/inquiries", {
          cookie: c.cookie,
          body: { items: [], leadName: "Zz Fixture", leadPhone: syntheticPhone(run, 45).slice(3), countryCode: "+91", datesFlexible: true, currency: "INR", source: "inquiry_form", whatsappConsent: true },
        }),
        ctx,
      );
      expect(res.status).toBe(422);
      expect(await prisma.inquiry.count()).toBe(before);
    });

    it("logout revokes the row; the old cookie no longer works", async () => {
      const c = await createCustomer(run, syntheticPhone(run, 46));
      const POST = await handler(() => import("@/app/api/auth/logout/route"), "POST");
      expect((await POST(apiRequest("/api/auth/logout", { method: "POST", cookie: c.cookie }), ctx)).status).toBe(200);
      expect((await prisma.customerSession.findUnique({ where: { id: c.sessionId } }))?.revokedAt).not.toBeNull();
      expect((await (await customerMe())(apiRequest("/api/auth/me", { cookie: c.cookie }), ctx)).status).toBe(401);
    });

    it("an expired session is refused", async () => {
      const c = await createCustomer(run, syntheticPhone(run, 47));
      await prisma.customerSession.update({ where: { id: c.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await (await customerMe())(apiRequest("/api/auth/me", { cookie: c.cookie }), ctx)).status).toBe(401);
    });

    it("a closed (deleted) customer cannot use an existing session or sign in again", async () => {
      const phone = syntheticPhone(run, 48);
      const c = await createCustomer(run, phone);
      await prisma.customer.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
      expect((await (await customerMe())(apiRequest("/api/auth/me", { cookie: c.cookie }), ctx)).status).toBe(401);
      const { r2 } = await signIn(phone);
      expect(r2.status).toBe(401);
      expect(await prisma.customerSession.count({ where: { customerId: c.id } })).toBe(1);
    });

    it("a token that only resembles a session is refused without a lookup hit", async () => {
      for (const t of ["", "short", "x".repeat(300), "A".repeat(43)]) {
        expect((await (await customerMe())(apiRequest("/api/auth/me", { cookie: `${CUSTOMER_COOKIE}=${t}` }), ctx)).status).toBe(401);
      }
    });
  });
});

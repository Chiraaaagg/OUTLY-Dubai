import "server-only";
import { randomInt } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma, TX_OPTIONS, type Tx } from "../lib/db";
import { env } from "../lib/env";
import { Errors } from "../lib/errors";
import { log } from "../lib/logger";
import { uuidv7 } from "../lib/ids";
import { hashIp, randomToken, safeEqual, sha256Hex } from "../lib/crypto";
import { enforceRateLimit } from "../lib/rate-limit";
import { audit } from "../lib/audit";
import { customerActor, type Actor } from "../lib/actor";
import { clientIp, userAgent as userAgentOf } from "../lib/http";
import { customerTokenFromCookies, customerTokenFromRequest } from "../lib/customer-session";
import { maskPhone, normalisePhone } from "../domain/phone";
import {
  attemptsRemaining,
  evaluateChallenge,
  generateOtpCode,
  hashOtp,
  isSessionLive,
  isValidOtpFormat,
  normaliseOtpInput,
  otpExpiresAt,
  sessionExpiresAt,
  shouldExtendSession,
  verdictMessage,
} from "../domain/otp";
import { hasRealSmsProvider, isWidgetMode, smsAdapter, widgetConfig } from "../sms/registry";
import { verifyWidgetToken } from "../sms/msg91-widget";
import { customerRepo, type CustomerRecord } from "../repositories/customer.repo";
import type { Currency, Dietary } from "@/lib/types";

/**
 * Customer authentication — phone + one-time code (impl/customer-auth-contract.md §1, §3;
 * docs/backend/13-security.md §2.1).
 *
 *  - Identity is the E.164 phone. No passwords; the account is created on the
 *    first successful verify and every inquiry/order made with that phone is
 *    linked then (verified identity only, never claimed).
 *  - Codes: 6 digits from `crypto.randomInt`, stored as SHA-256(challenge:code),
 *    TTL `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS` tries, single-use, constant-time
 *    compare. Requesting a new code retires the previous one.
 *  - Sessions: opaque random token; only its SHA-256 is stored. 30-day sliding
 *    expiry (extended once under 15 days remain). Logout revokes the row.
 *  - Never logged: the code, the token, the phone (masked only). Responses do
 *    not reveal whether a phone already has an account.
 *  - `enabled()`: outside production sign-in always works (the `log` SMS
 *    adapter writes the code to the server log); in production it exists only
 *    when a real SMS provider is configured. `FEATURE_CUSTOMER_AUTH` overrides.
 */

export interface CustomerPublic {
  id: string;
  phoneE164: string;
  phoneMasked: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  dietary?: Dietary;
  hotel?: string;
  preferredCurrency: Currency;
  createdAt: string;
}

export interface CustomerSession {
  customer: CustomerPublic;
  sessionId: string;
  expiresAt: Date;
  /** Request context for audit rows on this session's mutations. */
  actor: Actor;
}

/** Per-IP cap on verify calls so a bot cannot spread guesses across many challenges. */
const VERIFY_IP_LIMIT = 30;
const VERIFY_IP_WINDOW_SECONDS = 900;
/** Shared bucket for IP-less traffic (local dev) — never unlimited. */
const NO_IP_BUCKET = "none";

export function toCustomerPublic(c: CustomerRecord): CustomerPublic {
  const fullName = c.fullName?.trim() || undefined;
  return {
    id: c.id,
    phoneE164: c.phoneE164,
    phoneMasked: maskPhone(c.phoneE164),
    email: c.email,
    fullName,
    firstName: fullName?.split(/\s+/)[0],
    dietary: c.dietary,
    hotel: c.hotel,
    preferredCurrency: c.preferredCurrency,
    createdAt: c.createdAt.toISOString(),
  };
}

function actorFor(customerId: string, ctx?: { ipHash?: string; userAgent?: string }): Actor {
  return { ...customerActor(ctx), id: customerId };
}

async function resolveFromToken(token: string | undefined, ctx?: { ipHash?: string; userAgent?: string }): Promise<CustomerSession | null> {
  if (!token || token.length < 16 || token.length > 256) return null;
  const found = await customerRepo.findSessionByTokenHash(sha256Hex(token));
  if (!found) return null;
  const now = new Date();
  const { session, customer } = found;
  if (!isSessionLive(session, now)) return null;

  let expiresAt = session.expiresAt;
  if (shouldExtendSession(session.expiresAt, now)) {
    expiresAt = sessionExpiresAt(now, env().AUTH_CUSTOMER_SESSION_DAYS || 30);
    // Best effort — a failed extension just means the session ends on its original date.
    void customerRepo.extendSession(session.id, expiresAt).catch((error) => log.warn("customer_session.extend_failed", { error }));
  }

  return { customer: toCustomerPublic(customer), sessionId: session.id, expiresAt, actor: actorFor(customer.id, ctx) };
}

/**
 * Create (or find) the customer behind a *verified* phone and open a session.
 *
 * Both sign-in paths end here, under the same contract: the phone has already
 * been proven — by our own constant-time comparison in the OTP path, or by
 * MSG91's signed token in the widget path. Nothing below re-checks that, so a
 * caller must never reach this function with a phone the client merely claimed.
 *
 * `precondition` runs first, inside the transaction. The OTP path uses it to
 * consume the challenge, so a replayed code loses the race here instead of
 * minting a second session.
 */
async function mintSession(input: {
  phoneE164: string;
  now: Date;
  sessionDays: number;
  ctx: { ipHash?: string; userAgent?: string };
  precondition?: (tx: Tx) => Promise<void>;
}) {
  const { phoneE164, now, ctx } = input;
  const token = randomToken(32);
  const expiresAt = sessionExpiresAt(now, input.sessionDays || 30);
  const sessionId = uuidv7();

  const result = await prisma.$transaction(async (tx) => {
    await input.precondition?.(tx);

    const { customer, created } = await customerRepo.findOrCreateByPhone(phoneE164, tx);
    if (customer.deletedAt) throw Errors.unauthorized("This account has been closed.");
    const actor = actorFor(customer.id, ctx);

    if (created) await audit(actor, "customer.created", { type: "customer", id: customer.id }, {}, tx);

    const linked = await customerRepo.linkByPhone(customer.id, phoneE164, tx);
    if (linked.inquiries || linked.orders) {
      await audit(actor, "customer.linked_by_phone", { type: "customer", id: customer.id }, { after: linked }, tx);
    }

    await customerRepo.createSession(
      { id: sessionId, customerId: customer.id, tokenHash: sha256Hex(token), userAgent: ctx.userAgent, ipHash: ctx.ipHash, expiresAt },
      tx,
    );
    await customerRepo.touchLogin(customer.id, now, tx);
    await audit(actor, "customer.login", { type: "customer_session", id: sessionId }, {}, tx);

    return { customer: { ...customer, lastLoginAt: now }, linked };
  }, TX_OPTIONS);

  return { token, expiresAt, sessionId, customer: result.customer, linked: result.linked };
}

export const customerAuthService = {
  /** Is customer sign-in available in this environment? (contract §1) */
  enabled(): boolean {
    const e = env();
    if (e.FEATURE_CUSTOMER_AUTH !== undefined) return e.FEATURE_CUSTOMER_AUTH;
    return e.isNonProduction || hasRealSmsProvider();
  },

  /* ---------------------------------------------------------------- otp */

  async requestOtp(input: { phone: string; countryCode: string; ip?: string }) {
    if (!customerAuthService.enabled()) throw Errors.notConfigured("Customer sign-in");
    // In widget mode MSG91 sends the code straight from the browser. Leaving this
    // endpoint open would give an attacker a second, cheaper way to burn credits.
    if (isWidgetMode()) throw Errors.notConfigured("Server-side OTP");
    const e = env();

    const phone = normalisePhone(input.phone, input.countryCode);
    if (!phone.valid) throw Errors.validation({ phone: phone.reason ?? "Check the WhatsApp number" });

    const phoneKey = sha256Hex(phone.e164).slice(0, 16);
    const ipHash = hashIp(input.ip);
    await enforceRateLimit({ key: `otp_request:phone:${phoneKey}`, limit: e.OTP_RATE_LIMIT_PER_PHONE_PER_15MIN, windowSeconds: 900 });
    await enforceRateLimit({ key: `otp_request:ip:${ipHash ?? NO_IP_BUCKET}`, limit: e.OTP_RATE_LIMIT_PER_IP_PER_HOUR, windowSeconds: 3600 });

    const now = new Date();
    const ttlSeconds = e.OTP_TTL_SECONDS || 300;
    const id = uuidv7();
    const code = generateOtpCode(randomInt);

    await customerRepo.retireOpenChallenges(phone.e164, now);
    await customerRepo.createChallenge({
      id,
      phoneE164: phone.e164,
      codeHash: hashOtp(id, code, sha256Hex),
      expiresAt: otpExpiresAt(now, ttlSeconds),
      ipHash,
    });

    try {
      await smsAdapter().sendOtp({ to: phone.e164, code, ttlMinutes: Math.max(1, Math.round(ttlSeconds / 60)) });
    } catch {
      // The adapter already logged the provider failure. Retire the code so it cannot be used later.
      await customerRepo.consumeChallenge(id, new Date()).catch(() => {});
      throw Errors.internal("We couldn't send the code right now");
    }

    log.info("customer_auth.otp_requested", { challengeId: id, provider: smsAdapter().provider });
    return { challengeId: id, expiresInSeconds: ttlSeconds, phoneMasked: maskPhone(phone.e164) };
  },

  async verifyOtp(input: { challengeId: string; code: string; ip?: string; userAgent?: string }) {
    if (!customerAuthService.enabled()) throw Errors.notConfigured("Customer sign-in");
    const e = env();
    const maxAttempts = e.OTP_MAX_ATTEMPTS || 5;

    const code = normaliseOtpInput(input.code);
    if (!isValidOtpFormat(code)) throw Errors.validation({ code: "Enter the 6-digit code." });

    const ipHash = hashIp(input.ip);
    await enforceRateLimit({ key: `otp_verify:ip:${ipHash ?? NO_IP_BUCKET}`, limit: VERIFY_IP_LIMIT, windowSeconds: VERIFY_IP_WINDOW_SECONDS });

    const challenge = await customerRepo.findChallenge(input.challengeId);
    if (!challenge) throw Errors.notFound("Code");

    const now = new Date();
    const verdict = evaluateChallenge(challenge, now, maxAttempts);
    if (verdict === "locked") throw Errors.validation({ code: verdictMessage("locked") }, "Too many attempts");
    if (verdict !== "ok") throw Errors.unauthorized(verdictMessage(verdict));

    // Count the attempt before comparing so a crash between the two cannot hand out a free guess.
    const attempts = await customerRepo.bumpAttempts(challenge.id);
    if (attempts > maxAttempts) throw Errors.validation({ code: verdictMessage("locked") }, "Too many attempts");

    if (!safeEqual(hashOtp(challenge.id, code, sha256Hex), challenge.codeHash)) {
      const left = attemptsRemaining(attempts, maxAttempts);
      log.info("customer_auth.otp_mismatch", { challengeId: challenge.id, attemptsLeft: left });
      throw Errors.validation(
        {
          code:
            left > 0
              ? `That code didn't match. ${left} ${left === 1 ? "attempt" : "attempts"} left.`
              : verdictMessage("locked"),
        },
        "That code didn't match",
      );
    }

    const { token, expiresAt, sessionId, customer, linked } = await mintSession({
      phoneE164: challenge.phoneE164,
      now,
      sessionDays: e.AUTH_CUSTOMER_SESSION_DAYS,
      ctx: { ipHash, userAgent: input.userAgent },
      precondition: async (tx) => {
        // Single-use: whoever consumes first wins — a replay of the same code lands here.
        if (!(await customerRepo.consumeChallenge(challenge.id, now, tx))) throw Errors.unauthorized(verdictMessage("consumed"));
      },
    });

    log.info("customer_auth.login", { sessionId, method: "otp", linkedInquiries: linked.inquiries, linkedOrders: linked.orders });
    return { token, expiresAt, customer: toCustomerPublic(customer), linkedInquiries: linked.inquiries };
  },

  /* ------------------------------------------------------------- widget */

  /**
   * Widget sign-in (`SMS_PROVIDER=msg91_widget`).
   *
   * By the time we are called, MSG91 has already sent the code, collected it
   * and verified it in the browser; the only thing that crosses our boundary is
   * the signed access token. `verifyWidgetToken` exchanges it for the phone
   * MSG91 actually verified — the request body never gets a say in which
   * account is opened.
   *
   * Rate-limited per IP because, unlike the OTP path, there is no challenge row
   * to count attempts against. Every failure returns one message, so a caller
   * cannot tell a forged token from an expired one from a provider outage.
   */
  async verifyWidget(input: { accessToken: string; ip?: string; userAgent?: string }) {
    if (!customerAuthService.enabled()) throw Errors.notConfigured("Customer sign-in");
    const cfg = widgetConfig();
    if (!cfg) throw Errors.notConfigured("Customer sign-in");

    const ipHash = hashIp(input.ip);
    await enforceRateLimit({
      key: `otp_widget:ip:${ipHash ?? NO_IP_BUCKET}`,
      limit: VERIFY_IP_LIMIT,
      windowSeconds: VERIFY_IP_WINDOW_SECONDS,
    });

    let phoneE164: string;
    try {
      ({ phoneE164 } = await verifyWidgetToken({ authKey: cfg.authKey, accessToken: input.accessToken }));
    } catch {
      // The provider reason is already in the log; the customer gets one line.
      throw Errors.unauthorized("We couldn't confirm that code. Please try again.");
    }

    const now = new Date();
    const { token, expiresAt, sessionId, customer, linked } = await mintSession({
      phoneE164,
      now,
      sessionDays: env().AUTH_CUSTOMER_SESSION_DAYS,
      ctx: { ipHash, userAgent: input.userAgent },
    });

    log.info("customer_auth.login", { sessionId, method: "widget", linkedInquiries: linked.inquiries, linkedOrders: linked.orders });
    return { token, expiresAt, customer: toCustomerPublic(customer), linkedInquiries: linked.inquiries };
  },

  /* ------------------------------------------------------------ session */

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const revoked = await customerRepo.revokeSessionByTokenHash(sha256Hex(token), new Date());
    if (!revoked) return;
    await audit(actorFor(revoked.customerId), "customer.logout", { type: "customer_session", id: revoked.id });
  },

  /** Route handlers. */
  async resolveRequest(req: NextRequest): Promise<CustomerSession | null> {
    return resolveFromToken(customerTokenFromRequest(req), { ipHash: hashIp(clientIp(req)), userAgent: userAgentOf(req) });
  },

  /** Server Components / Server Actions. */
  async resolveCookies(): Promise<CustomerSession | null> {
    return resolveFromToken(await customerTokenFromCookies());
  },

  async requireRequest(req: NextRequest): Promise<CustomerSession> {
    const s = await customerAuthService.resolveRequest(req);
    if (!s) throw Errors.unauthorized();
    return s;
  },

  async requireCookies(): Promise<CustomerSession> {
    const s = await customerAuthService.resolveCookies();
    if (!s) throw Errors.unauthorized();
    return s;
  },
};

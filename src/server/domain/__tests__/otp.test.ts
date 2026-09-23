import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_SESSION_DAYS_DEFAULT,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS_DEFAULT,
  OTP_TTL_SECONDS_DEFAULT,
  SESSION_EXTEND_BELOW_MS,
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
} from "../otp";

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
const NOW = new Date("2026-09-18T10:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

describe("otp: code generation", () => {
  it("is always six digits with leading zeros preserved", () => {
    expect(generateOtpCode(() => 0)).toBe("000000");
    expect(generateOtpCode(() => 7)).toBe("000007");
    expect(generateOtpCode(() => 999_999)).toBe("999999");
    expect(generateOtpCode(() => 123_456)).toBe("123456");
  });

  it("asks the injected source for the full range [0, 10^6)", () => {
    let seen = -1;
    generateOtpCode((max) => {
      seen = max;
      return 1;
    });
    expect(seen).toBe(10 ** OTP_LENGTH);
  });

  it("refuses an out-of-range or non-integer source", () => {
    expect(() => generateOtpCode(() => 10 ** OTP_LENGTH)).toThrow();
    expect(() => generateOtpCode(() => -1)).toThrow();
    expect(() => generateOtpCode(() => 1.5)).toThrow();
  });

  it("looks uniform over a large sample from a real-ish source", () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 5000; i++) {
      const code = generateOtpCode((max) => Math.floor(Math.random() * max));
      expect(isValidOtpFormat(code)).toBe(true);
      counts[Number(code[0])]++;
    }
    // Every leading digit should appear — a padStart bug would collapse to "0".
    for (const c of counts) expect(c).toBeGreaterThan(300);
  });
});

describe("otp: input normalisation", () => {
  it("strips whitespace and dashes a customer may paste", () => {
    expect(normaliseOtpInput(" 123 456 ")).toBe("123456");
    expect(normaliseOtpInput("123-456")).toBe("123456");
    expect(normaliseOtpInput("1 2 3\t4 5 6")).toBe("123456");
  });

  it("validates exactly six digits", () => {
    expect(isValidOtpFormat("123456")).toBe(true);
    expect(isValidOtpFormat("12345")).toBe(false);
    expect(isValidOtpFormat("1234567")).toBe(false);
    expect(isValidOtpFormat("12345a")).toBe(false);
    expect(isValidOtpFormat("")).toBe(false);
    expect(isValidOtpFormat("１２３４５６")).toBe(false);
  });
});

describe("otp: hashing", () => {
  it("is SHA-256 over challengeId:code so the challenge id salts the code", () => {
    const h = hashOtp("chal-1", "123456", sha256Hex);
    expect(h).toBe(sha256Hex("chal-1:123456"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the same code under two challenges never shares a hash", () => {
    expect(hashOtp("a", "123456", sha256Hex)).not.toBe(hashOtp("b", "123456", sha256Hex));
  });

  it("never contains the code itself", () => {
    expect(hashOtp("chal", "987654", sha256Hex)).not.toContain("987654");
  });
});

describe("otp: expiry and challenge state", () => {
  it("defaults to a 5-minute TTL", () => {
    expect(OTP_TTL_SECONDS_DEFAULT).toBe(300);
    expect(otpExpiresAt(NOW).getTime()).toBe(NOW.getTime() + 300_000);
    expect(otpExpiresAt(NOW, 600).getTime()).toBe(NOW.getTime() + 600_000);
  });

  const fresh = () => ({ expiresAt: at(300_000), consumedAt: null, attempts: 0 });

  it("a fresh challenge is ok", () => {
    expect(evaluateChallenge(fresh(), NOW)).toBe("ok");
  });

  it("consumed wins over everything else (single-use)", () => {
    expect(evaluateChallenge({ ...fresh(), consumedAt: at(-1), attempts: 99, expiresAt: at(-1) }, NOW)).toBe("consumed");
  });

  it("expires exactly at the boundary, not one ms before", () => {
    expect(evaluateChallenge({ ...fresh(), expiresAt: at(1) }, NOW)).toBe("ok");
    expect(evaluateChallenge({ ...fresh(), expiresAt: NOW }, NOW)).toBe("expired");
    expect(evaluateChallenge({ ...fresh(), expiresAt: at(-1) }, NOW)).toBe("expired");
  });

  it("locks once the attempt cap is spent (default 5)", () => {
    expect(OTP_MAX_ATTEMPTS_DEFAULT).toBe(5);
    expect(evaluateChallenge({ ...fresh(), attempts: 4 }, NOW)).toBe("ok");
    expect(evaluateChallenge({ ...fresh(), attempts: 5 }, NOW)).toBe("locked");
    expect(evaluateChallenge({ ...fresh(), attempts: 2 }, NOW, 2)).toBe("locked");
  });

  it("expired is reported before locked", () => {
    expect(evaluateChallenge({ ...fresh(), attempts: 5, expiresAt: at(-1) }, NOW)).toBe("expired");
  });

  it("counts attempts remaining and never goes negative", () => {
    expect(attemptsRemaining(0)).toBe(5);
    expect(attemptsRemaining(4)).toBe(1);
    expect(attemptsRemaining(5)).toBe(0);
    expect(attemptsRemaining(9)).toBe(0);
    expect(attemptsRemaining(1, 3)).toBe(2);
  });

  it("verdict copy never reveals whether an account exists and always says to request a new code", () => {
    for (const v of ["expired", "consumed", "locked"] as const) {
      const msg = verdictMessage(v);
      expect(msg.toLowerCase()).toContain("request a new");
      expect(msg.toLowerCase()).not.toMatch(/account|registered|exist/);
    }
    expect(new Set(["expired", "consumed", "locked"].map((v) => verdictMessage(v as "expired"))).size).toBe(3);
  });
});

describe("customer sessions", () => {
  it("defaults to 30 days", () => {
    expect(CUSTOMER_SESSION_DAYS_DEFAULT).toBe(30);
    expect(sessionExpiresAt(NOW).getTime()).toBe(NOW.getTime() + 30 * 24 * 3600_000);
    expect(sessionExpiresAt(NOW, 1).getTime()).toBe(NOW.getTime() + 24 * 3600_000);
  });

  it("slides only when under the extension threshold and still alive", () => {
    expect(SESSION_EXTEND_BELOW_MS).toBe(15 * 24 * 3600_000);
    expect(shouldExtendSession(at(20 * 24 * 3600_000), NOW)).toBe(false);
    expect(shouldExtendSession(at(14 * 24 * 3600_000), NOW)).toBe(true);
    expect(shouldExtendSession(at(1), NOW)).toBe(true);
    // Already expired — extending would resurrect a dead session.
    expect(shouldExtendSession(NOW, NOW)).toBe(false);
    expect(shouldExtendSession(at(-1), NOW)).toBe(false);
  });

  it("isSessionLive requires not revoked and not expired", () => {
    expect(isSessionLive({ expiresAt: at(1000), revokedAt: null }, NOW)).toBe(true);
    expect(isSessionLive({ expiresAt: at(1000), revokedAt: at(-1) }, NOW)).toBe(false);
    expect(isSessionLive({ expiresAt: NOW, revokedAt: null }, NOW)).toBe(false);
    expect(isSessionLive({ expiresAt: at(-1), revokedAt: null }, NOW)).toBe(false);
  });
});

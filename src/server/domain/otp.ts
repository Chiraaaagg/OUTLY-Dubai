/**
 * Phone-OTP rules (docs/backend/13-security.md §2.1, impl/customer-auth-contract.md §1).
 *
 * PURE: no I/O, no env, no clock and no crypto import. Randomness and hashing
 * are injected so the service passes `node:crypto` (`randomInt`, `sha256Hex`)
 * and the unit tests pass deterministic stand-ins. This is the single place
 * the OTP shape, hashing recipe, attempt cap and expiry maths are defined.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS_DEFAULT = 300;
export const OTP_MAX_ATTEMPTS_DEFAULT = 5;

/** Session lifetime and the sliding-extension threshold (contract §1: 30-day sliding). */
export const CUSTOMER_SESSION_DAYS_DEFAULT = 30;
export const SESSION_EXTEND_BELOW_MS = 15 * 24 * 3600_000;

const DAY_MS = 24 * 3600_000;

/** Uniform integer in [0, max) — `crypto.randomInt(max)` has this exact shape. */
export type RandomInt = (max: number) => number;
export type Sha256Hex = (input: string) => string;

/** Six decimal digits, leading zeros preserved, uniform over 000000–999999. */
export function generateOtpCode(randomInt: RandomInt): string {
  const n = randomInt(10 ** OTP_LENGTH);
  if (!Number.isInteger(n) || n < 0 || n >= 10 ** OTP_LENGTH) throw new Error("randomInt out of range");
  return String(n).padStart(OTP_LENGTH, "0");
}

/** Strips whitespace/dashes a customer may paste and checks the shape. */
export function normaliseOtpInput(raw: string): string {
  return raw.replace(/[\s-]+/g, "");
}

export function isValidOtpFormat(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

/**
 * Stored form of a code: SHA-256 over `<challengeId>:<code>`. The challenge id
 * acts as a per-challenge salt so two challenges with the same code never
 * share a hash and a leaked table cannot be joined against a rainbow of the
 * one million possible codes.
 */
export function hashOtp(challengeId: string, code: string, sha256Hex: Sha256Hex): string {
  return sha256Hex(`${challengeId}:${code}`);
}

export function otpExpiresAt(now: Date, ttlSeconds = OTP_TTL_SECONDS_DEFAULT): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

export interface ChallengeState {
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
}

export type ChallengeVerdict = "ok" | "expired" | "consumed" | "locked";

/**
 * Whether a challenge may still accept a code. `attempts` is the number of
 * verifications already made; the caller increments it atomically before the
 * compare, so `attempts >= maxAttempts` means the cap has been spent.
 */
export function evaluateChallenge(ch: ChallengeState, now: Date, maxAttempts = OTP_MAX_ATTEMPTS_DEFAULT): ChallengeVerdict {
  if (ch.consumedAt) return "consumed";
  if (ch.expiresAt.getTime() <= now.getTime()) return "expired";
  if (ch.attempts >= maxAttempts) return "locked";
  return "ok";
}

export function attemptsRemaining(attempts: number, maxAttempts = OTP_MAX_ATTEMPTS_DEFAULT): number {
  return Math.max(0, maxAttempts - attempts);
}

/** Customer-facing wording for a verdict — never says whether the phone has an account. */
export function verdictMessage(verdict: Exclude<ChallengeVerdict, "ok">): string {
  switch (verdict) {
    case "expired":
      return "That code has expired. Request a new one.";
    case "consumed":
      return "That code has already been used. Request a new one.";
    case "locked":
      return "Too many attempts. Request a new code.";
  }
}

/* ------------------------------------------------------------- sessions */

export function sessionExpiresAt(now: Date, days = CUSTOMER_SESSION_DAYS_DEFAULT): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** Sliding expiry: extend once the session has less than 15 days left (cheap, idempotent). */
export function shouldExtendSession(expiresAt: Date, now: Date, belowMs = SESSION_EXTEND_BELOW_MS): boolean {
  const left = expiresAt.getTime() - now.getTime();
  return left > 0 && left < belowMs;
}

export function isSessionLive(s: { expiresAt: Date; revokedAt: Date | null }, now: Date): boolean {
  return !s.revokedAt && s.expiresAt.getTime() > now.getTime();
}

import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "./env";

/**
 * Admin/agent session cookies (§13.2.2).
 *
 *  - `outlyy_admin_session` — HS256 JWT {sid, sub} bound to an `admin_sessions`
 *    row (revocable), absolute expiry AUTH_ADMIN_SESSION_HOURS.
 *  - `outlyy_admin_pending` — 10-minute JWT issued after a correct password,
 *    before TOTP. Carries `stage: 'totp' | 'enrol'`. Grants no permissions.
 *
 * httpOnly + Secure (outside dev) + SameSite=Lax. Never readable by JS.
 *
 * Verification pins the algorithm to HS256 and checks issuer AND audience,
 * so a pending token can never be presented as a session token (or the
 * reverse), and a token signed any other way is refused outright. A valid
 * JWT is still only half the check: `authService` then requires the
 * `admin_sessions` row to be live and the user active, and reads
 * permissions from the database on every request.
 */

export const SESSION_COOKIE = "outlyy_admin_session";
export const PENDING_COOKIE = "outlyy_admin_pending";

export interface SessionClaims {
  sid: string;
  sub: string;
}

export interface PendingClaims {
  sub: string;
  stage: "totp" | "enrol";
}

function key() {
  return new TextEncoder().encode(env().AUTH_JWT_SECRET);
}

const ISSUER = "outlyy-admin";
const ALGORITHMS = ["HS256"];

export async function signSessionToken(claims: SessionClaims, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("session")
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key());
}

export async function signPendingToken(claims: PendingClaims): Promise<string> {
  return new SignJWT({ stage: claims.stage })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("pending")
    .setExpirationTime("10m")
    .sign(key());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ALGORITHMS, issuer: ISSUER, audience: "session" });
    if (typeof payload.sid !== "string" || typeof payload.sub !== "string") return null;
    return { sid: payload.sid, sub: payload.sub };
  } catch {
    return null;
  }
}

export async function verifyPendingToken(token: string): Promise<PendingClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ALGORITHMS, issuer: ISSUER, audience: "pending" });
    if (typeof payload.sub !== "string" || (payload.stage !== "totp" && payload.stage !== "enrol")) return null;
    return { sub: payload.sub, stage: payload.stage };
  } catch {
    return null;
  }
}

const cookieBase = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  // A production build is always Secure, even if APP_ENV was left at its "development" default.
  secure: env().APP_ENV !== "development" || process.env.NODE_ENV === "production",
  path: "/",
});

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(SESSION_COOKIE, token, { ...cookieBase(), expires: expiresAt });
  res.cookies.set(PENDING_COOKIE, "", { ...cookieBase(), maxAge: 0 });
}

export function setPendingCookie(res: NextResponse, token: string) {
  res.cookies.set(PENDING_COOKIE, token, { ...cookieBase(), maxAge: 600 });
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase(), maxAge: 0 });
  res.cookies.set(PENDING_COOKIE, "", { ...cookieBase(), maxAge: 0 });
}

export function sessionTokenFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE)?.value;
}

export function pendingTokenFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(PENDING_COOKIE)?.value;
}

/** Server Components / Server Actions. */
export async function sessionTokenFromCookies(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export async function pendingTokenFromCookies(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(PENDING_COOKIE)?.value;
}

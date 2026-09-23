import "server-only";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "./env";

/**
 * Customer session cookies (impl/customer-auth-contract.md §1). Mirrors
 * `session.ts` naming for the admin cookies.
 *
 *  - `outlyy_customer_session` — the opaque bearer token whose SHA-256 is the
 *    `customer_sessions.token_hash`. httpOnly + Secure (outside dev) +
 *    SameSite=Lax + path=/. The token is random; nothing is encoded in it.
 *  - `outlyy_customer` — a `1` hint, NOT httpOnly and carrying no data, so the
 *    header can choose "Sign in" vs "Account" from `document.cookie` without
 *    an API call. It grants nothing: every request re-resolves the httpOnly
 *    cookie against the database.
 *
 * Both cookies share one expiry so the hint never outlives the session.
 */

export const CUSTOMER_COOKIE = "outlyy_customer_session";
export const CUSTOMER_HINT_COOKIE = "outlyy_customer";

const base = () => ({
  sameSite: "lax" as const,
  secure: env().APP_ENV !== "development",
  path: "/",
});

export function setCustomerCookies(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(CUSTOMER_COOKIE, token, { ...base(), httpOnly: true, expires: expiresAt });
  res.cookies.set(CUSTOMER_HINT_COOKIE, "1", { ...base(), httpOnly: false, expires: expiresAt });
}

export function clearCustomerCookies(res: NextResponse) {
  res.cookies.set(CUSTOMER_COOKIE, "", { ...base(), httpOnly: true, maxAge: 0 });
  res.cookies.set(CUSTOMER_HINT_COOKIE, "", { ...base(), httpOnly: false, maxAge: 0 });
}

export function customerTokenFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(CUSTOMER_COOKIE)?.value || undefined;
}

/** Server Components / Server Actions. */
export async function customerTokenFromCookies(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(CUSTOMER_COOKIE)?.value || undefined;
}

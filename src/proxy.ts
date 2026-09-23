import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { CURRENCY_COOKIE, currencyForCountry, isDisplayCurrency } from "@/lib/currency";

/**
 * Request proxy (Next 16 name for middleware) — the edge of the app (§04.2).
 *
 *  1. Security headers on EVERY response (§13.8), including the early
 *     redirects/rewrites below. CSP:
 *       - /admin/** is force-dynamic, so it gets a per-request nonce with
 *         'strict-dynamic'. The CSP is also set on the *request* headers —
 *         that is how Next.js learns the nonce and stamps its own inline
 *         scripts with it (Next docs → "Content Security Policy → Nonces").
 *       - The storefront is statically prerendered (x-nextjs-prerender), so a
 *         nonce can never reach its inline bootstrap scripts; a nonce policy
 *         there would block hydration on every page. It keeps 'unsafe-inline'
 *         for scripts (no eval in production). Accepted deviation from §13.8,
 *         recorded in docs/backend/impl/security.md; the storefront renders
 *         fixture data only — no UGC, no customer text.
 *       - Development keeps eval for the toolchain.
 *  2. /admin/** — cheap gate: redirect to /admin/login without a valid
 *     session JWT. Real authorisation happens server-side in the admin layout
 *     and every service call; this only saves a render for logged-out hits.
 *  3. /design-system blocked in production unless FEATURE_DESIGN_SYSTEM_PAGE (§01 R3).
 *  4. Maintenance mode flag → /maintenance for the storefront only.
 *  5. Display currency — resolve the visitor's country from the edge geo
 *     header and stamp `outlyy_ccy` once. This is the only place geo is read;
 *     nothing downstream sniffs the browser language or the timezone, both of
 *     which are wrong for anyone travelling, on a VPN, or using an
 *     English-US phone in Dubai.
 *
 * No database access here. Nothing PII-bearing is logged.
 */

const SESSION_COOKIE = "outlyy_admin_session";
const PENDING_COOKIE = "outlyy_admin_pending";

/**
 * Google Analytics origins.
 *
 * gtag.js is served from googletagmanager.com and beacons to
 * google-analytics.com — plus a regional `region1.google-analytics.com` style
 * host, hence the wildcard. Without these the tag is blocked by the CSP and
 * fails silently, which is the hardest kind of analytics bug to notice.
 *
 * Storefront only. The admin console keeps its nonce + 'strict-dynamic'
 * policy with nothing added, because no third-party script belongs on a
 * screen showing customer PII.
 */
const GA_SCRIPT_SRC = "https://www.googletagmanager.com";
const GA_CONNECT_SRC = "https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com";

function buildCsp(scriptSrc: string, isProd: boolean, allowAnalytics: boolean): string {
  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}${allowAnalytics ? ` ${GA_SCRIPT_SRC}` : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'${allowAnalytics ? ` ${GA_CONNECT_SRC}` : ""}${isProd ? "" : " ws: wss:"}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

function securityHeaders(csp: string, isProd: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (isProd) headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  return headers;
}

/**
 * Country from the platform's edge geo header.
 *
 * Vercel sets `x-vercel-ip-country` on every request; Cloudflare sets
 * `cf-ipcountry`; `x-country` covers a generic proxy in front. All three are
 * set by infrastructure, not by the client, so they cannot be spoofed by the
 * browser — unlike Accept-Language or Intl timezone, which the brief rules out
 * and which this replaces.
 *
 * Returns null when no header is present (local development, an unknown
 * platform, or a request the edge could not locate). The caller then falls
 * back to DEFAULT_CURRENCY (AED).
 */
function geoCountry(req: NextRequest): string | null {
  const raw =
    req.headers.get("x-vercel-ip-country") ??
    req.headers.get("cf-ipcountry") ??
    req.headers.get("x-country");
  const code = raw?.trim().toUpperCase();
  // "XX" and "T1" are the platforms' own "unknown"/Tor placeholders.
  if (!code || code.length !== 2 || code === "XX" || code === "T1") return null;
  return code;
}

function withHeaders<T extends NextResponse>(res: T, headers: Record<string, string>): T {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_JWT_SECRET;
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "outlyy-admin", audience: "session" });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProd = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
  const isAdmin = pathname.startsWith("/admin");
  const nonce = btoa(crypto.randomUUID());
  const scriptSrc = !isProd
    ? `'self' 'unsafe-inline' 'unsafe-eval'`
    : isAdmin
      ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `'self' 'unsafe-inline'`;
  // Analytics origins are allowed on the storefront only, and only when a
  // measurement id is configured — an unconfigured deploy keeps the tighter policy.
  const allowAnalytics = !isAdmin && Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const csp = buildCsp(scriptSrc, isProd, allowAnalytics);
  const headers = securityHeaders(csp, isProd);
  if (isAdmin) {
    // Admin pages are never indexed or cached — also on the redirects below.
    headers["X-Robots-Tag"] = "noindex, nofollow";
    headers["Cache-Control"] = "no-store";
  }

  // 3. Debug surfaces never ship to production by omission.
  if (pathname.startsWith("/design-system") && process.env.APP_ENV === "production" && process.env.FEATURE_DESIGN_SYSTEM_PAGE !== "true") {
    return withHeaders(NextResponse.rewrite(new URL("/not-found", req.url), { status: 404 }), headers);
  }

  // 4. Maintenance mode — storefront only; admin and API stay reachable.
  if (
    process.env.FEATURE_MAINTENANCE_MODE === "true" &&
    !isAdmin &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/maintenance") &&
    !pathname.startsWith("/_next")
  ) {
    return withHeaders(NextResponse.rewrite(new URL("/maintenance", req.url), { status: 503 }), headers);
  }

  // 2. Admin gate.
  if (isAdmin) {
    const isAuthRoute = pathname === "/admin/login" || pathname === "/admin/verify" || pathname === "/admin/enrol";
    const ok = await hasValidSession(req);
    if (!ok && !isAuthRoute) {
      const hasPending = Boolean(req.cookies.get(PENDING_COOKIE)?.value);
      const url = new URL(hasPending ? "/admin/verify" : "/admin/login", req.url);
      if (!hasPending) url.searchParams.set("next", pathname);
      return withHeaders(NextResponse.redirect(url), headers);
    }
    if (ok && pathname === "/admin/login") {
      return withHeaders(NextResponse.redirect(new URL("/admin", req.url)), headers);
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  if (isAdmin) requestHeaders.set("Content-Security-Policy", csp);

  // 5. Display currency. Written once and then left alone, so a visitor who
  // picks a currency by hand keeps it — including an Indian traveller sitting
  // in a Dubai hotel. Dynamic pages read it through cookies(); static pages
  // read it in the pre-paint script (see CURRENCY_BOOTSTRAP_SCRIPT).
  const existing = req.cookies.get(CURRENCY_COOKIE)?.value;
  const currency = isDisplayCurrency(existing) ? null : currencyForCountry(geoCountry(req));
  if (currency) requestHeaders.set("x-outlyy-currency", currency);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (currency) {
    res.cookies.set(CURRENCY_COOKIE, currency, {
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: false, // the pre-paint script and the switcher both read it
      secure: isProd,
    });
  }
  return withHeaders(res, headers);
}

export const config = {
  // Everything except static assets. API routes get headers too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|manifest.webmanifest).*)"],
};

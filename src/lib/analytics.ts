/**
 * Analytics facade — the CLIENT half of the collector described in
 * docs/backend/11-analytics.md §3 and docs/backend/17-inquiry-mode-pivot.md §5.3.
 *
 * PRD §8 requires server-side tracking as the source of truth (client-only
 * under-reports 20–40%). This module normalises event names and properties,
 * pushes to `window.dataLayer`, and batches events to `/api/events` with a
 * stable `event_id` so the server can deduplicate against Meta CAPI
 * (AC-META-01). Money events are never trusted from here; services emit them.
 *
 * It also owns the first-party identity + attribution cookies:
 *   outlyy_sid   session id, 30-minute sliding window
 *   outlyy_aid   anonymous id, 1 year
 *   outlyy_attr  first-touch + last-touch attribution (JSON), 1 year
 *
 * Everything that touches the network or `document` is wrapped in try/catch:
 * analytics must never break an inquiry.
 *
 * The pure helpers (`deriveFbc`, `parseAttributionFromUrl`, `mergeAttribution`)
 * are exported for unit tests and must stay free of browser globals.
 */

import type { Rail, Tier } from "./types";
import { hasConsent } from "./consent";

/* ---------------------------------------------------------------------------
 * Event taxonomy — the server validates `event` against this exact list
 * ------------------------------------------------------------------------ */

export const ANALYTICS_EVENT_NAMES = [
  // Acquisition & discovery
  "page_view",
  "landing_page_view",
  "search_started",
  "search_submitted",
  "search_suggestion_selected",
  "filter_applied",
  "sort_applied",
  "activity_card_viewed",
  "activity_viewed",
  "activity_compared",
  "activity_saved",
  // Booking intent
  "date_selected",
  "time_selected",
  "guest_count_changed",
  "variant_selected",
  "add_to_cart",
  "checkout_started",
  "checkout_field_error",
  "coupon_applied",
  "coupon_rejected",
  "payment_method_selected",
  "payment_initiated",
  "payment_completed",
  "payment_failed",
  "supplier_confirmation_pending",
  "booking_confirmed",
  // Post-booking
  "voucher_downloaded",
  "voucher_sent_whatsapp",
  "booking_modified",
  "booking_cancelled",
  "review_submitted",
  "referral_clicked",
  // Inquiry mode — `inquiry_submitted` is the primary site conversion and maps
  // to Meta `Lead`; `booking_confirmed` remains the business conversion and is
  // uploaded offline when an agent wins the inquiry (pivot plan §5.3).
  "inquiry_started",
  "inquiry_item_added",
  "inquiry_submitted",
  "inquiry_field_error",
  "inquiry_whatsapp_alternative",
  // Inquiry pipeline — emitted by the server on state transitions; listed so
  // client and server agree on the taxonomy by construction (§11.2).
  "inquiry_acknowledged",
  "inquiry_first_response",
  "inquiry_quoted",
  "inquiry_won",
  "inquiry_lost",
  "inquiry_sla_breached",
  // Assisted rail — a conversion event, not an engagement event (PRD §8)
  "whatsapp_initiated",
  "support_contacted",
  "quote_requested",
  // Resilience
  "error_shown",
  "empty_state_shown",
  "retry_clicked",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENT_NAMES)[number];

export interface EventProps {
  activity_id?: string;
  activity_slug?: string;
  activity_category?: string;
  tier?: Tier;
  combo_slug?: string;
  landing_page?: string;
  page_type?: string;
  user_segment?: "fit" | "expat" | "unknown";
  device_type?: "mobile" | "tablet" | "desktop";
  traffic_source?: string;
  selected_date?: string;
  selected_time?: string;
  guest_count?: number;
  pax_breakdown?: string;
  price?: number;
  currency?: string;
  value?: number;
  payment_method?: string;
  booking_status?: string;
  booking_reference?: string;
  inquiry_reference?: string;
  inquiry_source?: string;
  fulfilment_mode?: "inquiry" | "instant";
  item_count?: number;
  rail?: Rail;
  whatsapp_context?: string;
  filters?: string;
  result_count?: number;
  has_dietary_filter?: boolean;
  sort?: string;
  position?: number;
  failure_reason?: string;
  field?: string;
  coupon?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    __outlyyEvents?: { name: string; props: EventProps; at: number }[];
  }
}

/* ---------------------------------------------------------------------------
 * Cookies
 *
 * Nothing below is written until the visitor has said yes. `hasConsent` is a
 * "no" for anyone who has not chosen, so a first paint sets no identifiers at
 * all — see src/lib/consent.ts.
 * ------------------------------------------------------------------------ */

export const COOKIE_NAMES = {
  session: "outlyy_sid",
  anon: "outlyy_aid",
  attribution: "outlyy_attr",
  /** Meta Pixel's own first-party cookie; read only, never written. */
  fbp: "_fbp",
} as const;

const SESSION_MAX_AGE_SECONDS = 30 * 60;
const YEAR_SECONDS = 365 * 24 * 60 * 60;
/** Ids we mint and accept back: URL-safe, 8–64 chars. Mirrors the server check. */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    const prefix = `${name}=`;
    for (const part of document.cookie.split(";")) {
      const p = part.trim();
      if (p.startsWith(prefix)) return decodeURIComponent(p.slice(prefix.length));
    }
  } catch {
    /* cookies disabled */
  }
  return undefined;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  try {
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
  } catch {
    /* cookies disabled — ids live for this page only */
  }
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validId(v: string | undefined): string | undefined {
  return v && ID_PATTERN.test(v) ? v : undefined;
}

/* ---------------------------------------------------------------------------
 * Attribution — pure helpers (unit-tested, no browser globals)
 * ------------------------------------------------------------------------ */

/** One touch: what the URL + referrer of a page load tell us about how the visitor arrived. */
export interface AttributionTouch {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  gclid?: string;
  fbclid?: string;
  /** Referrer origin + path, query stripped, ≤ 200 chars. Absent for internal navigation. */
  referrer?: string;
  /** Landing pathname (no query), ≤ 200 chars. */
  landing: string;
  /** True when a campaign parameter, click id, or external referrer is present. */
  hasSignal: boolean;
}

/**
 * Flat first-touch + last-touch attribution. Deliberately flat with `first_*`
 * and `last_*` prefixes: `inquiryService.convertToOrder` reads exactly these
 * keys when it copies attribution to `order_attribution` (§17 §8.4). Bounded
 * to 20 keys so it fits the `attribution` schema on POST /api/inquiries.
 */
export interface Attribution {
  first_source?: string;
  first_medium?: string;
  first_campaign?: string;
  first_term?: string;
  first_content?: string;
  first_referrer?: string;
  first_landing?: string;
  first_touch_at?: string;
  last_source?: string;
  last_medium?: string;
  last_campaign?: string;
  last_term?: string;
  last_content?: string;
  last_referrer?: string;
  last_landing?: string;
  last_touch_at?: string;
  gclid?: string;
  fbclid?: string;
  /** Meta click id in CAPI format: `fb.1.<ms>.<fbclid>` (§11.4.1). */
  fbc?: string;
  /** Meta browser id from the `_fbp` cookie when the Pixel has set one. */
  fbp?: string;
}

const MAX_ATTR_LEN = 200;
const clip = (v: string | null | undefined): string | undefined => {
  if (!v) return undefined;
  const t = v.trim();
  return t ? t.slice(0, MAX_ATTR_LEN) : undefined;
};

const SEARCH_HOSTS = ["google.", "bing.com", "yahoo.", "duckduckgo.com", "yandex.", "baidu.com"];
const SOCIAL_HOSTS = ["facebook.com", "fb.com", "instagram.com", "t.co", "twitter.com", "x.com", "linkedin.com", "youtube.com", "whatsapp.com", "pinterest."];

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function mediumForHost(host: string): string {
  if (SEARCH_HOSTS.some((h) => host.includes(h))) return "organic";
  if (SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))) return "social";
  return "referral";
}

/**
 * Meta's required `fbc` format (§11.4.1): `fb.1.<creation time ms>.<fbclid>`.
 * This is the field that makes offline conversion upload work.
 */
export function deriveFbc(fbclid: string | null | undefined, ts: number): string | undefined {
  const id = clip(fbclid);
  if (!id) return undefined;
  return `fb.1.${Math.floor(ts)}.${id}`;
}

/**
 * Reads campaign parameters, click ids, and the referrer for one page load.
 * `url` is the full current URL; `referrer` is `document.referrer` (may be
 * empty). A referrer on the same host is internal navigation and ignored.
 */
export function parseAttributionFromUrl(url: string, referrer?: string): AttributionTouch {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  const params = parsed?.searchParams;
  const get = (k: string) => clip(params?.get(k));

  const landing = clip(parsed?.pathname) ?? "/";
  const ownHost = parsed ? parsed.hostname.toLowerCase().replace(/^www\./, "") : undefined;
  const refHost = hostOf(referrer);
  const externalRef = refHost && refHost !== ownHost ? refHost : undefined;

  let referrerClean: string | undefined;
  if (externalRef && referrer) {
    try {
      const r = new URL(referrer);
      referrerClean = clip(`${r.origin}${r.pathname}`);
    } catch {
      referrerClean = undefined;
    }
  }

  const utmSource = get("utm_source");
  const utmMedium = get("utm_medium");
  const gclid = get("gclid");
  const fbclid = get("fbclid");

  let source = utmSource;
  let medium = utmMedium;
  if (!source) {
    if (fbclid) {
      source = "facebook";
      medium = medium ?? "paid_social";
    } else if (gclid) {
      source = "google";
      medium = medium ?? "cpc";
    } else if (externalRef) {
      source = externalRef;
      medium = medium ?? mediumForHost(externalRef);
    }
  }

  const hasSignal = Boolean(utmSource || gclid || fbclid || externalRef);
  return {
    source,
    medium,
    campaign: get("utm_campaign"),
    term: get("utm_term"),
    content: get("utm_content"),
    gclid,
    fbclid,
    referrer: referrerClean,
    landing,
    hasSignal,
  };
}

function touchFields(prefix: "first" | "last", t: AttributionTouch, at: number): Partial<Attribution> {
  const out: Record<string, string | undefined> = {
    [`${prefix}_source`]: t.source ?? "direct",
    [`${prefix}_medium`]: t.medium ?? "none",
    [`${prefix}_campaign`]: t.campaign,
    [`${prefix}_term`]: t.term,
    [`${prefix}_content`]: t.content,
    [`${prefix}_referrer`]: t.referrer,
    [`${prefix}_landing`]: t.landing,
    [`${prefix}_touch_at`]: new Date(at).toISOString(),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as Partial<Attribution>;
}

/**
 * Folds one page load into stored attribution. First touch is written once
 * and never changed; last touch is replaced whenever the load carries a
 * campaign signal. Click ids are kept from the most recent load that had
 * them. `fbp` is the Pixel cookie value, if any.
 */
export function mergeAttribution(
  existing: Attribution | null | undefined,
  touch: AttributionTouch,
  now: number,
  fbp?: string | null,
): Attribution {
  const base: Attribution = existing ? { ...existing } : {};
  const isNew = !existing || !existing.first_touch_at;

  if (isNew) Object.assign(base, touchFields("first", touch, now), touchFields("last", touch, now));
  else if (touch.hasSignal) Object.assign(base, touchFields("last", touch, now));

  if (touch.gclid) base.gclid = touch.gclid;
  if (touch.fbclid) {
    base.fbclid = touch.fbclid;
    base.fbc = deriveFbc(touch.fbclid, now);
  }
  const fbpClean = clip(fbp);
  if (fbpClean) base.fbp = fbpClean;

  return base;
}

function readAttributionCookie(): Attribution | null {
  const raw = readCookie(COOKIE_NAMES.attribution);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && /^[a-z_]{1,32}$/.test(k)) out[k] = v.slice(0, MAX_ATTR_LEN);
    }
    return out as Attribution;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * Client context — ids + attribution for every event and for POST /api/inquiries
 * ------------------------------------------------------------------------ */

export interface ClientContext {
  sessionId?: string;
  anonId?: string;
  attribution?: Record<string, unknown>;
}

/**
 * Mint or refresh the first-party cookies. Called once from `AppProvider` on
 * mount and again (cheaply) on every `track` so the session window slides.
 * Idempotent; safe to call any number of times.
 *
 * Consent-gated per category: measurement covers the anonymous and session
 * ids, marketing covers attribution (which carries gclid/fbclid). Without the
 * grant the cookie is not written and the id is simply absent — the caller
 * gets `{}` and events go out without identifiers, or not at all.
 */
export function ensureClientContext(): ClientContext {
  if (typeof window === "undefined") return {};
  try {
    const ctx: ClientContext = {};

    if (hasConsent("measurement")) {
      const anonId = validId(readCookie(COOKIE_NAMES.anon)) ?? newId();
      writeCookie(COOKIE_NAMES.anon, anonId, YEAR_SECONDS);
      ctx.anonId = anonId;

      const sessionId = validId(readCookie(COOKIE_NAMES.session)) ?? newId();
      writeCookie(COOKIE_NAMES.session, sessionId, SESSION_MAX_AGE_SECONDS);
      ctx.sessionId = sessionId;
    }

    if (hasConsent("marketing")) {
      const existing = readAttributionCookie();
      const touch = parseAttributionFromUrl(window.location.href, typeof document !== "undefined" ? document.referrer : "");
      const next = mergeAttribution(existing, touch, Date.now(), readCookie(COOKIE_NAMES.fbp));
      // Only rewrite when something changed — keeps Set-Cookie churn off every render.
      const serialised = JSON.stringify(next);
      if (!existing || JSON.stringify(existing) !== serialised) writeCookie(COOKIE_NAMES.attribution, serialised, YEAR_SECONDS);
      ctx.attribution = next as Record<string, unknown>;
    }

    return ctx;
  } catch {
    return {};
  }
}

/**
 * Current ids + attribution, read from the cookies. Used by `submitInquiry`
 * (src/lib/api/index.ts) so the inquiry row carries `sessionId`, `anonId`
 * and the flat attribution that `convertToOrder` copies to `order_attribution`.
 */
export function getClientContext(): ClientContext {
  if (typeof window === "undefined") return {};
  // No consent, no identifiers — an inquiry still submits, it just carries none.
  if (!hasConsent("measurement") && !hasConsent("marketing")) return {};
  try {
    const anonId = validId(readCookie(COOKIE_NAMES.anon));
    if (!anonId) return ensureClientContext();
    const sessionId = validId(readCookie(COOKIE_NAMES.session));
    const attribution = readAttributionCookie() ?? undefined;
    return { sessionId, anonId, attribution: attribution as Record<string, unknown> | undefined };
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------------------
 * track()
 * ------------------------------------------------------------------------ */

function deviceType(): EventProps["device_type"] {
  if (typeof window === "undefined") return undefined;
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function eventId(name: string): string {
  return `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fire an analytics event. Safe to call during render-adjacent effects; never
 * throws, never blocks. Server-side truth is posted best-effort in batches.
 */
export function track(name: AnalyticsEvent, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  // Measurement consent gates the whole pipeline: no dataLayer push, no
  // network call, nothing retained. An undecided visitor is not measured.
  if (!hasConsent("measurement")) return;

  let ctx: ClientContext = {};
  try {
    ctx = ensureClientContext();
  } catch {
    ctx = {};
  }

  const payload: Record<string, unknown> = {
    event: name,
    event_id: eventId(name),
    device_type: deviceType(),
    page_path: window.location.pathname,
    ts: Date.now(),
    session_id: ctx.sessionId,
    anon_id: ctx.anonId,
    ...props,
  };

  // Source breakdown (§17 §5.3 "inquiry→won by source") keys off the last
  // touch carried on page views; only added where the caller has not set it.
  if ((name === "page_view" || name === "landing_page_view") && ctx.attribution) {
    const a = ctx.attribution as Attribution;
    if (payload.traffic_source === undefined && a.last_source) payload.traffic_source = a.last_source;
    if (payload.traffic_medium === undefined && a.last_medium) payload.traffic_medium = a.last_medium;
    if (payload.traffic_campaign === undefined && a.last_campaign) payload.traffic_campaign = a.last_campaign;
    if (payload.landing_page === undefined && a.first_landing) payload.landing_page = a.first_landing;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);

  // In-memory ring buffer: powers the /design-system analytics inspector and
  // makes events assertable in end-to-end tests without a network stub.
  window.__outlyyEvents = window.__outlyyEvents ?? [];
  window.__outlyyEvents.push({ name, props, at: payload.ts as number });
  if (window.__outlyyEvents.length > 200) window.__outlyyEvents.shift();

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", name, props);
  }

  enqueue(payload);
}

/* ---------------------------------------------------------------------------
 * Delivery — batched sendBeacon with fetch(keepalive) fallback
 * ------------------------------------------------------------------------ */

const FLUSH_AFTER_MS = 2000;
const MAX_QUEUE = 20;

let queue: Record<string, unknown>[] = [];
let flushTimer: number | null = null;
let listenersBound = false;

function endpoint(): string | undefined {
  const ep = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  return ep && ep.trim() ? ep.trim() : undefined;
}

function bindListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  try {
    // pagehide is the reliable unload signal on mobile Safari; visibilitychange
    // covers tab switches where the page may be frozen without pagehide.
    window.addEventListener("pagehide", () => flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  } catch {
    /* ignore */
  }
}

function enqueue(payload: Record<string, unknown>) {
  if (!endpoint()) return;
  bindListeners();
  queue.push(payload);
  if (queue.length >= MAX_QUEUE) {
    flush();
    return;
  }
  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => flush(), FLUSH_AFTER_MS);
  }
}

/** Sends everything queued. Exported for tests and the design-system inspector. */
export function flush(): void {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  deliver(batch);
}

/**
 * INTEGRATION BOUNDARY — swap for GTM / Segment if ever needed. Nothing else
 * in the app knows how events are transported. Posts a JSON array; the server
 * accepts one object or an array.
 */
function deliver(batch: Record<string, unknown>[]) {
  const url = endpoint();
  if (!url) return;
  let body: string;
  try {
    body = JSON.stringify(batch);
  } catch {
    return;
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch(url, {
      method: "POST",
      body,
      keepalive: true,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
    }).catch(() => {});
  } catch {
    /* analytics must never break a booking */
  }
}

/** Read the client-side buffer (debug tooling only). */
export function recentEvents() {
  if (typeof window === "undefined") return [];
  return window.__outlyyEvents ?? [];
}

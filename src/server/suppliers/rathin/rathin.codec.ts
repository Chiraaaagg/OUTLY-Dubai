/**
 * Rathin wire-format helpers — the parts of the adapter that CAN be written
 * today, from the Postman collection samples, with no credentials
 * (docs/backend/16-rathin-api-validation.md §8 Phase 1: "the shared
 * response-envelope parser (C4) and the money/date conversion helpers (C8)").
 *
 * Pure functions, unit-tested against the literal values in the collection.
 * Nothing here performs I/O.
 */

/* ---------------------------------------------------------------------------
 * Response envelope (§16 C4)
 * ------------------------------------------------------------------------ */

export interface RathinEnvelope<T = unknown> {
  status?: boolean | null;
  responseCode?: string | null;
  message?: string | null;
  data?: T | null;
  errors?: unknown;
}

export type RathinParsed<T> =
  | { ok: true; data: T; message: string | null }
  | { ok: false; reason: "http" | "no_data" | "errors" | "malformed"; httpStatus: number; message: string | null; errors: unknown };

/**
 * Success rule: `HTTP 2xx && data != null && errors == null`. NEVER branch on
 * `status` or `responseCode` — `GetTicketTypes` returned `status: false` with
 * a fully populated `data` on a successful call (§16 §1.3).
 */
export function parseRathinEnvelope<T = unknown>(httpStatus: number, body: unknown): RathinParsed<T> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "malformed", httpStatus, message: null, errors: null };
  }
  const env = body as RathinEnvelope<T>;
  const message = typeof env.message === "string" ? env.message : null;
  if (httpStatus < 200 || httpStatus >= 300) {
    return { ok: false, reason: "http", httpStatus, message, errors: env.errors ?? null };
  }
  if (env.errors !== null && env.errors !== undefined) {
    return { ok: false, reason: "errors", httpStatus, message, errors: env.errors };
  }
  if (env.data === null || env.data === undefined) {
    return { ok: false, reason: "no_data", httpStatus, message, errors: null };
  }
  return { ok: true, data: env.data, message };
}

/* ---------------------------------------------------------------------------
 * Dates (§16 C8) — Rathin uses DD-MM-YYYY; we use YYYY-MM-DD (Asia/Dubai local)
 * ------------------------------------------------------------------------ */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RATHIN_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

/** "2026-12-27" → "27-12-2026". Throws on anything that is not a calendar date key. */
export function toRathinDate(isoDate: string): string {
  const m = ISO_DATE.exec(isoDate);
  if (!m) throw new Error("toRathinDate: expected YYYY-MM-DD");
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "27-12-2023" → "2023-12-27". Timezone is assumed Asia/Dubai pending §16 Q10. */
export function fromRathinDate(rathinDate: string): string {
  const m = RATHIN_DATE.exec(rathinDate.trim().slice(0, 10));
  if (!m) throw new Error("fromRathinDate: expected DD-MM-YYYY");
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/* ---------------------------------------------------------------------------
 * Money (§16 C8) — decimal fares with no currency field → BigInt minor units
 * ------------------------------------------------------------------------ */

/**
 * "170.00" | 170 | 1998.0 | "45.00" → 17000n | 17000n | 199800n | 4500n.
 * Integer arithmetic on the decimal string: no float multiplication, so a
 * silent 100x error cannot come from here. Currency is configured per
 * supplier (`suppliers.capabilities.currency`), never inferred (§16 Q3).
 */
export function rathinFareToMinor(fare: string | number): bigint {
  const s = typeof fare === "number" ? fare.toString() : fare.trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error("rathinFareToMinor: unparseable fare");
  const sign = m[1] === "-" ? -1n : 1n;
  const whole = BigInt(m[2]);
  const frac = (m[3] ?? "").padEnd(2, "0");
  if (frac.length > 2 && /[1-9]/.test(frac.slice(2))) {
    throw new Error("rathinFareToMinor: more than two decimal places");
  }
  return sign * (whole * 100n + BigInt(frac.slice(0, 2)));
}

/* ---------------------------------------------------------------------------
 * pricingKey — plain base64 carrying the fare in cleartext (§16 §1.2).
 * Decoded ONLY for logging/assertions on our side; we never mint one.
 * ------------------------------------------------------------------------ */

export interface DecodedPricingKey {
  parkId: string;
  ticketTypeId: string;
  amount: string;
  adultCount: string;
  childCount: string;
  travelDate: string;
  timeSlot: string | null;
  raw: string;
}

/** Best-effort decode of `parkId@ticketTypeId@AMOUNT@adult@child@DD-MM-YYYY[@HH:mm@T@ref]`. Returns null if it does not look like one. */
export function decodePricingKey(key: string): DecodedPricingKey | null {
  let raw: string;
  try {
    raw = Buffer.from(key, "base64").toString("utf8");
  } catch {
    return null;
  }
  const parts = raw.split("@");
  if (parts.length < 6) return null;
  const [parkId, ticketTypeId, amount, adultCount, childCount, travelDate, timeSlot] = parts;
  if (!RATHIN_DATE.test(travelDate)) return null;
  return { parkId, ticketTypeId, amount, adultCount, childCount, travelDate, timeSlot: timeSlot || null, raw };
}

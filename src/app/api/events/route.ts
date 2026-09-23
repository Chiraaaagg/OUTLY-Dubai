import { NextResponse, type NextRequest } from "next/server";
import { analyticsService, type ClientEventInput } from "@/server/services/analytics.service";
import { assertSameOrigin, clientIp, geoCountry, handle, userAgent } from "@/server/lib/http";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { hashIp, sha256Hex } from "@/server/lib/crypto";
import { Errors } from "@/server/lib/errors";
import { env } from "@/server/lib/env";
import { log } from "@/server/lib/logger";
import { parseEventsBody } from "@/server/schemas/events.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/events — the collector (§11.3, §19 §3).
 *
 * Accepts one event object or an array (the client batches via sendBeacon).
 * Tolerates `text/plain` bodies: the body is read as text and parsed as JSON
 * regardless of content-type. Validates each event against the taxonomy in
 * `src/lib/analytics.ts`, rate-limits per anonymous id (cookie `outlyy_aid`,
 * falling back to the hashed IP), enriches with session/anon ids, hashed IP,
 * user agent and geo country, persists, and answers 204. Forwarding to ad
 * platforms happens after the write and is never awaited.
 *
 * Unknown event names and malformed items: 422 in development so a typo in
 * `track()` is caught immediately; 204 with `x-events-accepted: 0` in
 * production so a stale client can never break the page (§11.3 step 1).
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
/** Client clocks drift; anything further out than this uses the server clock for ordering. */
const TS_SKEW_MS = 7 * 86_400_000;
const RESERVED = new Set(["event", "event_id", "ts", "session_id", "anon_id"]);

function cookieId(req: NextRequest, name: string): string | undefined {
  const v = req.cookies.get(name)?.value;
  return v && ID_PATTERN.test(v) ? v : undefined;
}

function payloadId(v: unknown): string | undefined {
  return typeof v === "string" && ID_PATTERN.test(v) ? v : undefined;
}

function noContent(accepted: number, rejected: number, duplicates: number): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "x-events-accepted": String(accepted),
      "x-events-rejected": String(rejected),
      "x-events-duplicates": String(duplicates),
    },
  });
}

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const e = env();
  const strict = !e.isProduction;

  let raw: unknown;
  try {
    const text = await req.text();
    raw = text.trim() ? JSON.parse(text) : undefined;
  } catch {
    if (strict) throw Errors.validation({ _: "Malformed JSON body" });
    return noContent(0, 1, 0);
  }

  const parsed = parseEventsBody(raw);
  if (parsed.unknownNames.length) {
    log.warn("analytics.unknown_event", { names: [...new Set(parsed.unknownNames)].slice(0, 10) });
  }
  if (strict && parsed.issues.length) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const idx = issue.indexOf(": ");
      fields[issue.slice(0, idx)] = issue.slice(idx + 2);
    }
    throw Errors.validation(fields, "Analytics event rejected");
  }

  // Identity: cookies are authoritative; payload ids are a fallback for the
  // first request of a session when the cookie has not been set yet.
  const first = parsed.events[0] as Record<string, unknown> | undefined;
  const anonId = cookieId(req, "outlyy_aid") ?? payloadId(first?.anon_id);
  const sessionId = cookieId(req, "outlyy_sid") ?? payloadId(first?.session_id);
  const ipHash = hashIp(clientIp(req));

  // Rate limit — per request, keyed by anon id, never by raw IP (§19 §0).
  const key = anonId ? `events:aid:${sha256Hex(anonId).slice(0, 16)}` : ipHash ? `events:ip:${ipHash}` : "events:anon";
  await enforceRateLimit({ key, limit: e.EVENTS_RATE_LIMIT_PER_HOUR, windowSeconds: 3600 });

  if (!parsed.events.length) return noContent(0, parsed.rejected, 0);

  const now = Date.now();
  const ua = userAgent(req);
  const geo = geoCountry(req);
  const events: ClientEventInput[] = parsed.events.map((ev) => {
    const { event, event_id, ts, ...rest } = ev;
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (!RESERVED.has(k)) props[k] = v;
    const safeTs = typeof ts === "number" && Math.abs(ts - now) <= TS_SKEW_MS ? ts : undefined;
    return {
      event,
      event_id,
      ts: safeTs,
      props,
      sessionId: sessionId ?? payloadId(ev.session_id),
      anonId: anonId ?? payloadId(ev.anon_id),
      ipHash,
      userAgent: ua,
      geoCountry: geo,
    };
  });

  const result = await analyticsService.collect(events);
  return noContent(result.accepted, parsed.rejected, result.duplicates);
});

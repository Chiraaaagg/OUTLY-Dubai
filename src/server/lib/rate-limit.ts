import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { log } from "./logger";
import { Errors } from "./errors";

/**
 * Rate limiting — Postgres fixed-window counters.
 *
 * Redis is intentionally not part of the launch stack (§18 §1.6: "rate
 * limiting can be a Postgres table at your volumes"). This module is the port;
 * `@upstash/ratelimit` slots in behind the same `rateLimit()` signature later.
 *
 * Failure policy (§14.4 "Redis outage → degraded, not down"): if the counter
 * cannot be read, the request is allowed and the failure is logged. A broken
 * limiter must never take the inquiry form down.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const now = new Date();
  const windowMs = opts.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);

  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      INSERT INTO rate_limit_buckets (bucket_key, window_start, count, expires_at)
      VALUES (${opts.key}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT (bucket_key, window_start)
      DO UPDATE SET count = rate_limit_buckets.count + 1
      RETURNING count
    `);
    const count = Number(rows[0]?.count ?? 1);
    const allowed = count <= opts.limit;
    const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));

    // Opportunistic cleanup — no cron needed for a table this small.
    if (Math.random() < 0.02) {
      void prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
    }

    return { allowed, remaining: Math.max(0, opts.limit - count), retryAfterSeconds, limit: opts.limit };
  } catch (error) {
    log.error("rate_limit.unavailable — failing open", { error, key: opts.key.split(":")[0] });
    return { allowed: true, remaining: opts.limit, retryAfterSeconds: 0, limit: opts.limit };
  }
}

/**
 * In-memory fixed-window limiter for cheap, high-frequency checks (admin
 * console clicks, public catalogue reads). Per instance, so on a multi-
 * instance deploy the effective limit is N × the budget — acceptable for
 * abuse control on reads; anything security-critical (login, OTP, inquiry
 * submission, lookup) keeps the Postgres limiter above. Costs no round trip,
 * which on a remote database is the difference between 10 ms and 1.4 s.
 */
const memoryBuckets = new Map<string, { count: number; windowStart: number }>();
let memorySweep = 0;

export function memoryRateLimit(opts: { key: string; limit: number; windowSeconds: number }): RateLimitResult {
  const now = Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  let b = memoryBuckets.get(opts.key);
  if (!b || b.windowStart !== windowStart) {
    b = { count: 0, windowStart };
    memoryBuckets.set(opts.key, b);
  }
  b.count++;
  if (++memorySweep % 500 === 0) {
    for (const [k, v] of memoryBuckets) if (now - v.windowStart > windowMs * 2) memoryBuckets.delete(k);
  }
  return { allowed: b.count <= opts.limit, remaining: Math.max(0, opts.limit - b.count), retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)), limit: opts.limit };
}

export function enforceMemoryRateLimit(opts: { key: string; limit: number; windowSeconds: number }): RateLimitResult {
  const r = memoryRateLimit(opts);
  if (!r.allowed) throw Errors.rateLimited(r.retryAfterSeconds);
  return r;
}

/** Throws the 429 envelope with Retry-After details when exceeded. */
export async function enforceRateLimit(opts: { key: string; limit: number; windowSeconds: number }) {
  const r = await rateLimit(opts);
  if (!r.allowed) throw Errors.rateLimited(r.retryAfterSeconds);
  return r;
}

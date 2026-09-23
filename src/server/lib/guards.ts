import "server-only";
import type { NextRequest } from "next/server";
import type { Permission } from "./permissions";
import { enforceMemoryRateLimit, enforceRateLimit } from "./rate-limit";
import { clientIp } from "./http";
import { authService, type ResolvedSession } from "../services/auth.service";
import { hashIp } from "./crypto";

/**
 * Route guards that combine the three checks every admin/agent JSON route
 * needs — session, permission, per-actor rate limit — so a handler cannot
 * forget one. Public routes use `publicRateLimit` keyed on the caller's IP.
 *
 * Budgets (fixed windows, Postgres-backed, fail open):
 *   admin default   300 / min per user  (console clicks, list refreshes)
 *   admin.heavy      20 / hour per user (imports, exports, bulk writes)
 *   public.search   120 / min per IP
 *   public.read     600 / min per IP
 */
export const RATE = {
  admin: { limit: 300, windowSeconds: 60 },
  adminHeavy: { limit: 20, windowSeconds: 3600 },
  publicSearch: { limit: 120, windowSeconds: 60 },
  publicRead: { limit: 600, windowSeconds: 60 },
} as const;

export type RateBudget = { limit: number; windowSeconds: number };

export async function requireAdmin(req: NextRequest, permission?: Permission, budget: RateBudget = RATE.admin): Promise<ResolvedSession> {
  const session = await authService.requireRequest(req, permission);
  // Heavy budgets (imports, exports) are enforced in Postgres — they must hold
  // across instances; the per-minute click budget is in-memory (no round trip).
  if (budget.windowSeconds >= 3600) await enforceRateLimit({ key: `admin:${session.user.id}:${budget.windowSeconds}`, ...budget });
  else enforceMemoryRateLimit({ key: `admin:${session.user.id}:${budget.windowSeconds}`, ...budget });
  return session;
}

/** IP-keyed limit for unauthenticated routes. The IP is hashed so it never lands in the table. */
export async function publicRateLimit(req: NextRequest, scope: string, budget: RateBudget): Promise<void> {
  const ip = clientIp(req) ?? "unknown";
  enforceMemoryRateLimit({ key: `pub:${scope}:${hashIp(ip) ?? "unknown"}`, ...budget });
}

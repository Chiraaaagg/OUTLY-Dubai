import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { handle, json } from "@/server/lib/http";
import { customerTokenFromRequest, setCustomerCookies } from "@/server/lib/customer-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — `{ customer, expiresAt }` or 401.
 * Re-issues the cookies with the session's current expiry so the sliding
 * extension performed on resolve is reflected in the browser as well.
 */
export const GET = handle(async (req: NextRequest) => {
  const session = await customerAuthService.requireRequest(req);
  const res = json({ customer: session.customer, expiresAt: session.expiresAt.toISOString() });
  const token = customerTokenFromRequest(req);
  if (token) setCustomerCookies(res, token, session.expiresAt);
  return res;
});

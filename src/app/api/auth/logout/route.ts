import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { assertSameOrigin, handle, json } from "@/server/lib/http";
import { clearCustomerCookies, customerTokenFromRequest } from "@/server/lib/customer-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout — revokes the session row and clears both cookies. Always `{ ok: true }`. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  await customerAuthService.logout(customerTokenFromRequest(req));
  const res = json({ ok: true });
  clearCustomerCookies(res);
  return res;
});

import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { assertSameOrigin, clientIp, handle, json, parseJson, userAgent } from "@/server/lib/http";
import { setCustomerCookies } from "@/server/lib/customer-session";
import { verifyWidgetSchema } from "@/server/schemas/customer.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/otp/widget — `{ accessToken }` → sets the session cookies
 * → `{ customer, linkedInquiries }`.
 *
 * The MSG91 widget counterpart to `/api/auth/otp/verify`. The body carries only
 * the provider's signed token; the phone it stands for is resolved server-side,
 * so this route cannot be used to sign in as an arbitrary number. Rate limiting
 * and the NOT_CONFIGURED (503) gate live in the service.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const body = await parseJson(req, verifyWidgetSchema);
  const { token, expiresAt, customer, linkedInquiries } = await customerAuthService.verifyWidget({
    accessToken: body.accessToken,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });
  const res = json({ customer, linkedInquiries });
  setCustomerCookies(res, token, expiresAt);
  return res;
});

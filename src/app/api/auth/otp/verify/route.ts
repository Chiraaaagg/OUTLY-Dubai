import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { assertSameOrigin, clientIp, handle, json, parseJson, userAgent } from "@/server/lib/http";
import { setCustomerCookies } from "@/server/lib/customer-session";
import { verifyOtpSchema } from "@/server/schemas/customer.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/otp/verify — `{ challengeId, code }` → sets the session cookies
 * → `{ customer, linkedInquiries }`. The token itself is never in the body.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const body = await parseJson(req, verifyOtpSchema);
  const { token, expiresAt, customer, linkedInquiries } = await customerAuthService.verifyOtp({
    challengeId: body.challengeId,
    code: body.code,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });
  const res = json({ customer, linkedInquiries });
  setCustomerCookies(res, token, expiresAt);
  return res;
});

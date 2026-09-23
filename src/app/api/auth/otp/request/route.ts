import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { assertSameOrigin, clientIp, handle, json, parseJson } from "@/server/lib/http";
import { requestOtpSchema } from "@/server/schemas/customer.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/otp/request — `{ phone, countryCode }` → `{ challengeId, expiresInSeconds, phoneMasked }`.
 * Rate limits (per phone, per IP) and the NOT_CONFIGURED (503) gate live in the service.
 * The response is identical whether or not the phone already has an account.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const body = await parseJson(req, requestOtpSchema);
  const result = await customerAuthService.requestOtp({ phone: body.phone, countryCode: body.countryCode, ip: clientIp(req) });
  return json(result);
});

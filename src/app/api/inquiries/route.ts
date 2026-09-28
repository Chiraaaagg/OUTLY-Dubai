import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { assertSameOrigin, clientIp, handle, json, parseJson, userAgent } from "@/server/lib/http";
import { Errors } from "@/server/lib/errors";
import { env } from "@/server/lib/env";
import { createInquirySchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inquiries — the storefront's terminal event in inquiry mode
 * (§17 §5.2). Same-origin only.
 *
 * Whether verification is required is decided here and nowhere else, by
 * `FEATURE_VERIFIED_INQUIRIES`:
 *
 *   off  anyone may submit. A signed-in visitor still gets their inquiry
 *        linked to their account, because the session is read either way.
 *   on   a caller without a session gets VERIFICATION_REQUIRED (401), and the
 *        form answers that by opening the code step inline and resubmitting
 *        the same payload. It never navigates to /login, which would lose a
 *        filled-in form and read as a signup wall.
 *
 * The flag is off while the MSG91 widget cannot deliver an access token; see
 * `env.ts`. The storefront reads no flag of its own, so there is nothing to
 * keep in step — it submits, and reacts to whatever this route answers.
 *
 * The service validates identity, rate-limits per phone and IP, evaluates
 * spam, re-prices every item server-side, persists, routes to an agent and
 * fires the acknowledgements. Client prices are never trusted; a mismatch is
 * recorded as a signal.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const body = await parseJson(req, createInquirySchema);

  // Read the session regardless: an inquiry from someone already signed in is
  // linked to their account whether or not verification is being enforced.
  const session = await customerAuthService.resolveRequest(req);
  if (!session && env().FEATURE_VERIFIED_INQUIRIES) throw Errors.verificationRequired();

  const result = await inquiryService.create(body, {
    ip: clientIp(req),
    userAgent: userAgent(req),
    customer: session ? { id: session.customer.id, phoneE164: session.customer.phoneE164 } : undefined,
  });
  return json(result, { status: 201 });
});

import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { customerService } from "@/server/services/customer.service";
import { assertSameOrigin, handle, json, parseJson } from "@/server/lib/http";
import { RATE, publicRateLimit } from "@/server/lib/guards";
import { preferencesSchema } from "@/server/schemas/customer.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/preferences — `{ whatsappTransactional, whatsappMarketing, email }`. */
export const GET = handle(async (req: NextRequest) => {
  await publicRateLimit(req, "me", RATE.publicSearch);
  const session = await customerAuthService.requireRequest(req);
  return json(await customerService.getPreferences(session));
});

/** PUT /api/me/preferences — full replacement; each change appends a consent row (source "profile"). */
export const PUT = handle(async (req: NextRequest) => {
  await publicRateLimit(req, "me", RATE.publicSearch);
  assertSameOrigin(req);
  const session = await customerAuthService.requireRequest(req);
  const body = await parseJson(req, preferencesSchema);
  return json(await customerService.updatePreferences(session, body));
});

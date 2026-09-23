import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { customerService } from "@/server/services/customer.service";
import { assertSameOrigin, handle, json, parseJson } from "@/server/lib/http";
import { RATE, publicRateLimit } from "@/server/lib/guards";
import { updateProfileSchema } from "@/server/schemas/customer.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/me — profile patch (empty string clears a field) → `{ customer }`. */
export const PATCH = handle(async (req: NextRequest) => {
  await publicRateLimit(req, "me", RATE.publicSearch);
  assertSameOrigin(req);
  const session = await customerAuthService.requireRequest(req);
  const body = await parseJson(req, updateProfileSchema);
  const customer = await customerService.updateProfile(session, body);
  return json({ customer });
});

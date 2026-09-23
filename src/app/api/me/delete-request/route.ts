import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { customerService } from "@/server/services/customer.service";
import { Errors } from "@/server/lib/errors";
import { assertSameOrigin, handle, json, parseWith } from "@/server/lib/http";
import { RATE, publicRateLimit } from "@/server/lib/guards";
import { deletionRequestSchema } from "@/server/schemas/customer.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/delete-request — `{ reason? }` (an empty body is fine) → `{ ok: true }`.
 * Records the request and alerts ops; nothing is deleted here (§05.8 anonymisation is an ops action).
 */
export const POST = handle(async (req: NextRequest) => {
  await publicRateLimit(req, "me", RATE.publicSearch);
  assertSameOrigin(req);
  const session = await customerAuthService.requireRequest(req);
  const raw = (await req.text()).trim();
  let input: unknown = {};
  if (raw) {
    try {
      input = JSON.parse(raw);
    } catch {
      throw Errors.validation({ _: "Malformed JSON body" }, "Malformed JSON body");
    }
  }
  const body = parseWith(deletionRequestSchema, input);
  await customerService.requestDeletion(session, body.reason || undefined);
  return json({ ok: true });
});

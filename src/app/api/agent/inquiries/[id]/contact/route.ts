import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idParamSchema, logContactSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/agent/inquiries/:id/contact — record a customer touch. On a
 * new/assigned inquiry this is the first response (sets `first_response_at`);
 * later it resets the follow-up clock without changing status.
 */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.update");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const body = await parseJson(req, logContactSchema);
  const detail = await inquiryService.logContact(actor, id, body.note);
  return json(detail);
});

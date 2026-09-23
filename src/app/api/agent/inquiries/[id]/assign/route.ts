import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { assignInquirySchema, idParamSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/agent/inquiries/:id/assign — lead/ops reassignment; the new agent is notified. */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.assign");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const body = await parseJson(req, assignInquirySchema);
  const detail = await inquiryService.assign(actor, id, body.agentId, body.reason);
  return json(detail);
});

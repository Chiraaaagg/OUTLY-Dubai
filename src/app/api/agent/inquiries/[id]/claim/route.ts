import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idParamSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/agent/inquiries/:id/claim — take an unassigned inquiry from the queue. */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.claim");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const detail = await inquiryService.claim(actor, id);
  return json(detail);
});

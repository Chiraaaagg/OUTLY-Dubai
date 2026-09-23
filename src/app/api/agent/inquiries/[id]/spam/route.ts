import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idParamSchema, markSpamSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/agent/inquiries/:id/spam — junk lead; `suppress` also blocks the number (§17 §7.5). */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.mark_spam");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const body = await parseJson(req, markSpamSchema);
  const detail = await inquiryService.markSpam(actor, id, { reason: body.reason, suppress: body.suppress });
  return json(detail);
});

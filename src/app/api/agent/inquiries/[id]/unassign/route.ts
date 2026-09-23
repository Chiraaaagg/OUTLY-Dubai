import type { NextRequest } from "next/server";
import { z } from "zod";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idParamSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();

/** POST /api/agent/inquiries/:id/unassign — release to the queue. Owner may release their own; others need `inquiries.assign`. */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.claim");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const body = await parseJson(req, bodySchema);
  return json(await inquiryService.unassign(actor, id, body.reason));
});

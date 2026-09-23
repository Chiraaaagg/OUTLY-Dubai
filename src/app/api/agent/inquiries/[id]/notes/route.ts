import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { addNoteSchema, idParamSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/agent/inquiries/:id/notes — internal note on the timeline. */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.update");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const body = await parseJson(req, addNoteSchema);
  const detail = await inquiryService.addNote(actor, id, body.note);
  return json(detail);
});

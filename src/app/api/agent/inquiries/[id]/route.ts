import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { handle, json, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idParamSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/agent/inquiries/:id — full detail. The service enforces own-vs-all and logs PII access. */
export const GET = handle<Ctx>(async (req: NextRequest, ctx) => {
  const { actor } = await requireAdmin(req, "inquiries.view_own");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const detail = await inquiryService.get(actor, id);
  return json(detail);
});

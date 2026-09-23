import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { convertInquirySchema, idParamSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/agent/inquiries/:id/convert — the win path (§17 §6.5). Creates
 * the order through `orderService.createOrder` by column copy, records the
 * manual payment, marks the inquiry `won`. Idempotent on the inquiry id.
 */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.convert");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const body = await parseJson(req, convertInquirySchema);
  const result = await inquiryService.convertToOrder(actor, id, body);
  return json(result, { status: 201 });
});

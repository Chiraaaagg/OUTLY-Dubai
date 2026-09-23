import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { itemParamSchema, updateItemSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/**
 * PATCH /api/agent/inquiries/:id/items/:itemId — agent-confirmed price and
 * availability per item. Responds with `{ inquiry, toleranceExceeded,
 * tolerancePercent }` so the console can force the "explain and re-consent"
 * step when the confirmed price moved above the indicative (§17 §7.5).
 */
export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.update");
  const { id, itemId } = parseWith(itemParamSchema, await ctx.params);
  const body = await parseJson(req, updateItemSchema);
  const result = await inquiryService.updateItem(actor, id, itemId, body);
  return json(result);
});

import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { handle, json, parseQuery } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { listInquiriesQuerySchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agent/inquiries — the queue. Ownership scoping (own vs all) is applied inside the service. */
export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "inquiries.view_own");
  const filters = parseQuery(req, listInquiriesQuerySchema);
  const result = await inquiryService.list(actor, filters);
  return json(result);
});

import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { handle, json } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agent/inquiries/counts — queue badges (per status, breached, mine, unassigned). */
export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "inquiries.view_own");
  const counts = await inquiryService.queueCounts(actor);
  return json(counts);
});

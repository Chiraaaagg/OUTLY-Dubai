import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { handle, json } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agent/agents — routable agents for the assign picker. Public
 * fields plus current load only; never emails, roles or permissions. Goes
 * through the service (not the repository) to keep the transport layer thin.
 */
export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "inquiries.view_own");
  const agents = await inquiryService.listAgents(actor);
  return json({ agents });
});

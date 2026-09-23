import { z } from "zod";
import type { NextRequest } from "next/server";
import { analyticsService } from "@/server/services/analytics.service";
import { handle, json, parseQuery } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/reports/agents?from&to — per-agent performance (`analytics.view` or `reports.view`). Defaults to the last 30 days. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const querySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict();

export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req);
  const q = parseQuery(req, querySchema);
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 86_400_000);
  return json({ range: { from: from.toISOString(), to: to.toISOString() }, agents: await analyticsService.agentPerformance(actor, { from, to }) });
});

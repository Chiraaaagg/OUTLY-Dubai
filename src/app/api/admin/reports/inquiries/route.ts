import { z } from "zod";
import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { analyticsService } from "@/server/services/analytics.service";
import { handle, json, parseQuery } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/inquiries?from=YYYY-MM-DD&to=YYYY-MM-DD
 * (`reports.view`). Defaults to the last 30 days; `to` is inclusive.
 *
 * Returns `inquiryService.metrics` (pipeline counts, first-response
 * percentiles, SLA hit rate, win rate, GMV, loss reasons) plus the
 * analytics report: funnel, inquiry rate by tier, source breakdown and
 * client/server reconciliation (§17 §5.3, §7.6).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const querySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict();

function rangeFrom(q: z.infer<typeof querySchema>): { from: Date; to: Date } {
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
}

export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "reports.view");
  const range = rangeFrom(parseQuery(req, querySchema));
  const [metrics, analytics] = await Promise.all([
    inquiryService.metrics(actor, range),
    analyticsService.report(actor, range),
  ]);
  return json({ metrics, ...analytics });
});

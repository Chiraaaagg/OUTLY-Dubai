import type { NextRequest } from "next/server";
import { runOfflineConversions } from "@/server/analytics/offline-conversions";
import { handle, json, requireCron } from "@/server/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/jobs/offline-conversions — Meta offline conversion upload for won
 * inquiries (AC-META-02). Intended for a daily Vercel Cron (`vercel.json`,
 * owned by the Inquiry Engine agent — see docs/backend/impl/analytics.md
 * "Requests"). GET for cron, POST for manual runs; both need CRON_SECRET.
 *
 * Today the upload adapter is TODO(meta-offline): the job counts and logs
 * pending orders and returns the number. Nothing is marked as uploaded.
 */
async function run(req: NextRequest) {
  requireCron(req);
  const summary = await runOfflineConversions();
  return json({ ok: true, ...summary, ranAt: new Date().toISOString() });
}

export const GET = handle(run);
export const POST = handle(run);

import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { handle, json, requireCron } from "@/server/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Cron functions get up to 60s on Hobby/300s on Pro; the sweep caps each batch at 200 rows. */
export const maxDuration = 60;

/**
 * /api/jobs/inquiry-sweep — SLA breaches, the follow-up ladder, auto-lost and
 * failed-notification retries (§17 §7.2, §7.5). Vercel Cron calls GET with
 * `Authorization: Bearer $CRON_SECRET` every 5 minutes (vercel.json); POST is
 * for manual runs with the same secret. Disabled (503) when no secret is set.
 */
async function run(req: NextRequest) {
  requireCron(req);
  const summary = await inquiryService.sweep();
  return json({ ok: true, ...summary, ranAt: new Date().toISOString() });
}

export const GET = handle(run);
export const POST = handle(run);

import type { NextRequest } from "next/server";
import { activityService } from "@/server/services/activity.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { activityStatusSchema, idSchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/activities/:id/status — `{ status: draft|published|archived, reason? }` (`products.publish`). */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "products.publish");
  const id = parseWith(idSchema, (await params).id);
  const body = await parseJson(req, activityStatusSchema);
  return json(await activityService.setStatus(actor, id, body.status, body.reason));
});

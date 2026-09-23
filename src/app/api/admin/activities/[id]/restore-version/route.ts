import type { NextRequest } from "next/server";
import { activityService } from "@/server/services/activity.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idSchema, restoreVersionSchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/activities/:id/restore-version — `{ version, reason? }` writes a new version equal to the old one (`products.edit`). */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "products.edit");
  const id = parseWith(idSchema, (await params).id);
  const body = await parseJson(req, restoreVersionSchema);
  return json(await activityService.restoreVersion(actor, id, body.version, body.reason));
});

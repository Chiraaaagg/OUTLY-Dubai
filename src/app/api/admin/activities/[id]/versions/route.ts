import type { NextRequest } from "next/server";
import { activityService } from "@/server/services/activity.service";
import { handle, json, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idSchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/activities/:id/versions — full history, newest first (`products.edit`). */
export const GET = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  const { actor } = await requireAdmin(req, "products.edit");
  const id = parseWith(idSchema, (await params).id);
  return json({ versions: await activityService.listVersions(actor, id) });
});

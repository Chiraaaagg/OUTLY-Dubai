import type { NextRequest } from "next/server";
import { activityService } from "@/server/services/activity.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { categoryStatusSchema, deleteCategorySchema, idSchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/categories/:id — `{ status, reason? }` (`categories.edit`). */
export const PATCH = handle<Ctx>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "categories.edit");
  const id = parseWith(idSchema, (await params).id);
  const body = await parseJson(req, categoryStatusSchema);
  return json(await activityService.setCategoryStatus(actor, id, body.status, body.reason));
});

/** DELETE /api/admin/categories/:id — soft delete; refused while activities still use it (`categories.edit`). */
export const DELETE = handle<Ctx>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "categories.edit");
  const id = parseWith(idSchema, (await params).id);
  const body = await parseJson(req, deleteCategorySchema);
  return json(await activityService.removeCategory(actor, id, body.reason));
});

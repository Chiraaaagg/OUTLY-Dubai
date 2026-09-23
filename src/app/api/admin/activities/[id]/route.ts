import type { NextRequest } from "next/server";
import { activityService } from "@/server/services/activity.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { deleteActivitySchema, idSchema, updateActivitySchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/activities/:id — row + full content + version summary (`products.edit`). */
export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const { actor } = await requireAdmin(req, "products.edit");
  const id = parseWith(idSchema, (await params).id);
  return json(await activityService.get(actor, id));
});

/** PATCH /api/admin/activities/:id — `{ activity, expectedVersion?, reason? }`; stale version → 409 (`products.edit`). */
export const PATCH = handle<Ctx>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "products.edit");
  const id = parseWith(idSchema, (await params).id);
  const body = await parseJson(req, updateActivitySchema);
  return json(await activityService.update(actor, id, body.activity, { reason: body.reason, expectedVersion: body.expectedVersion }));
});

/** DELETE /api/admin/activities/:id — soft delete, `{ reason }` required (`products.delete`). */
export const DELETE = handle<Ctx>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "products.delete");
  const id = parseWith(idSchema, (await params).id);
  const body = await parseJson(req, deleteActivitySchema);
  return json(await activityService.remove(actor, id, body.reason));
});

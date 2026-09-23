import type { NextRequest } from "next/server";
import { activityService } from "@/server/services/activity.service";
import { assertSameOrigin, handle, json, parseJson, parseQuery } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { activityListQuerySchema, createActivitySchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/activities?q&status&tier&category&page&pageSize (`products.edit`). */
export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "products.edit");
  const filters = parseQuery(req, activityListQuerySchema);
  return json(await activityService.list(actor, filters));
});

/** POST /api/admin/activities — `{ activity, status?, reason? }` → 201 (`products.edit`; publishing needs `products.publish`). */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "products.edit");
  const body = await parseJson(req, createActivitySchema);
  const row = await activityService.create(actor, body.activity, { status: body.status, reason: body.reason });
  return json(row, { status: 201 });
});

import type { NextRequest } from "next/server";
import { activityService } from "@/server/services/activity.service";
import { assertSameOrigin, handle, json, parseJson } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { upsertCategorySchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/categories — all live categories with activity counts (`products.edit`). */
export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "products.edit");
  return json({ categories: await activityService.listCategories(actor) });
});

/** POST /api/admin/categories — create or update by slug `{ category, reason? }` (`categories.edit`). */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "categories.edit");
  const body = await parseJson(req, upsertCategorySchema);
  return json(await activityService.upsertCategory(actor, body.category, { reason: body.reason }), { status: 201 });
});

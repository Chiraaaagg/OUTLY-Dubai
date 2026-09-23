import type { NextRequest } from "next/server";
import { settingsService } from "@/server/services/settings.service";
import { assertSameOrigin, handle, json, parseJson } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { updateSettingSchema } from "@/server/schemas/admin.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/settings — all typed settings (`reports.view`). */
export const GET = handle(async (req: NextRequest) => {
  await requireAdmin(req, "reports.view");
  return json(await settingsService.all());
});

/** PUT /api/admin/settings — `{ key, value }`; value validated per key by the service (`settings.edit`). */
export const PUT = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "settings.edit");
  const { key, value } = await parseJson(req, updateSettingSchema);
  const saved = await settingsService.update(actor, key, value);
  return json({ key, value: saved });
});

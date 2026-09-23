import type { NextRequest } from "next/server";
import { importService } from "@/server/services/import.service";
import { assertSameOrigin, handle, json, parseJson } from "@/server/lib/http";
import { RATE, requireAdmin } from "@/server/lib/guards";
import { importFetchSchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/imports/fetch — `{ url }` (docs.google.com only) → sheet headers + sample rows + suggested mapping, or a doc draft (`imports.run`, 20/hour). */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "imports.run", RATE.adminHeavy);
  const { url } = await parseJson(req, importFetchSchema);
  return json(await importService.fetch(actor, url));
});

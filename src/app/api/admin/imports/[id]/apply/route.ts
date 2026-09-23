import type { NextRequest } from "next/server";
import { importService } from "@/server/services/import.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { RATE, requireAdmin } from "@/server/lib/guards";
import { idSchema, importApplySchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/imports/:id/apply — `{ partial?, publish?, reason? }`; all-or-nothing unless `partial` (`imports.run`, 20/hour). */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "imports.run", RATE.adminHeavy);
  const id = parseWith(idSchema, (await params).id);
  const body = await parseJson(req, importApplySchema);
  return json(await importService.apply(actor, id, body));
});

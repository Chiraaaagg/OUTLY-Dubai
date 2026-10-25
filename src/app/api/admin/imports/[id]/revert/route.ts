import type { NextRequest } from "next/server";
import { importService } from "@/server/services/import.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { RATE, requireAdmin } from "@/server/lib/guards";
import { idSchema, importRevertSchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/imports/:id/revert — `{ reason? }`; created rows soft-deleted, updated rows restored to their
 * pre-import version (`imports.run`, 20/hour). The service additionally requires `products.delete` when the batch
 * created listings and `products.edit` when it updated any (403 before any write), and refuses with 409 when the
 * batch is not applied (or already reverted) or any listing changed after the import.
 */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "imports.run", RATE.adminHeavy);
  const id = parseWith(idSchema, (await params).id);
  const body = await parseJson(req, importRevertSchema);
  return json(await importService.revert(actor, id, body.reason));
});

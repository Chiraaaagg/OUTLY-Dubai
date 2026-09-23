import type { NextRequest } from "next/server";
import { catalogService } from "@/server/services/catalog.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { fulfilmentModeSchema, productIdSchema } from "@/server/schemas/admin.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/products/:id/fulfilment-mode — THE HINGE (§17 §6.4).
 * Body `{ kind: "product" | "combo", mode, reason }` (`products.publish`).
 * Instant requires an active API supplier mapping; the service refuses otherwise.
 */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "products.publish");
  const id = parseWith(productIdSchema, (await params).id);
  const body = await parseJson(req, fulfilmentModeSchema);
  const after = await catalogService.setFulfilmentMode(actor, { kind: body.kind, id }, body.mode, body.reason);
  return json({ id: after.id, kind: body.kind, fulfilmentMode: after.fulfilmentMode });
});

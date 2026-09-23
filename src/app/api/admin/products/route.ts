import type { NextRequest } from "next/server";
import { catalogService } from "@/server/services/catalog.service";
import { handle, json } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/products — products + combos with tier, confirmation and fulfilment mode (`products.edit`). */
export const GET = handle(async (req: NextRequest) => {
  await requireAdmin(req, "products.edit");
  const [products, combos] = await Promise.all([catalogService.listProducts(), catalogService.listCombos()]);
  return json({ products, combos });
});

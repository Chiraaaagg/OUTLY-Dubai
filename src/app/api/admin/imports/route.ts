import type { NextRequest } from "next/server";
import { importService } from "@/server/services/import.service";
import { handle, json, parseQuery } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { importListQuerySchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/imports?page — batches, newest first (`imports.run`). */
export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "imports.run");
  const { page } = parseQuery(req, importListQuerySchema);
  return json(await importService.list(actor, page));
});

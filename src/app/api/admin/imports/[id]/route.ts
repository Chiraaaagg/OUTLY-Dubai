import type { NextRequest } from "next/server";
import { importService } from "@/server/services/import.service";
import { handle, json, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idSchema } from "@/server/schemas/catalog.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/imports/:id — batch with preview rows, errors and applied items (`imports.run`). */
export const GET = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  const { actor } = await requireAdmin(req, "imports.run");
  const id = parseWith(idSchema, (await params).id);
  return json(await importService.get(actor, id));
});

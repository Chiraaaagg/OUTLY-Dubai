import { NextResponse, type NextRequest } from "next/server";
import { importService } from "@/server/services/import.service";
import { handle } from "@/server/lib/http";
import { RATE, requireAdmin } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/imports/export — every activity as an import-compatible CSV (the template for sheets) (`products.edit`, 20/hour). */
export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "products.edit", RATE.adminHeavy);
  const csv = await importService.exportCsv(actor);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="outlyy-activities-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});

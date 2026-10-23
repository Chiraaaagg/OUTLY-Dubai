import type { NextRequest } from "next/server";
import { importService } from "@/server/services/import.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { RATE, requireAdmin } from "@/server/lib/guards";
import { Errors } from "@/server/lib/errors";
import { importPreviewSchema, mappingSchema } from "@/server/schemas/catalog.schemas";
import { decodeCsvBytes } from "@/server/imports/parsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD = 5 * 1024 * 1024;

/**
 * POST /api/admin/imports/preview (`imports.run`, 20/hour)
 *
 * JSON body: `{ source: "csv", text, fileName?, mapping? }` | `{ source: "sheet", url, mapping? }`
 *            | `{ source: "doc", url? | text?, mapping? }` | `{ source: "bulk", items: ActivityInput[] }`
 * Multipart: `file` (CSV, ≤5 MB; UTF-8, UTF-16 or Windows-1252) + optional `mapping` (JSON string).
 * Returns the batch id + per-row validation; nothing is written to products.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "imports.run", RATE.adminHeavy);
  const ct = req.headers.get("content-type") ?? "";
  if (ct.startsWith("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) throw Errors.validation({ file: "Attach a CSV file" });
    if (file.size > MAX_UPLOAD) throw Errors.validation({ file: "CSV must be 5 MB or smaller" });
    if (!/\.(csv|tsv|txt)$/i.test(file.name) && !/text\/(csv|plain|tab-separated-values)/i.test(file.type)) throw Errors.validation({ file: "Only .csv files are accepted" });
    const mappingRaw = fd.get("mapping");
    const mapping = typeof mappingRaw === "string" && mappingRaw ? parseWith(mappingSchema, JSON.parse(mappingRaw)) : undefined;
    // file.text() assumes UTF-8 and turns an Excel "CSV" (Windows-1252) or "Unicode text" (UTF-16) export into mojibake.
    const { text, encoding } = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    const notes = encoding === "utf-8" ? [] : [`Read as ${encoding === "windows-1252" ? "Windows-1252 (Excel “CSV”)" : "UTF-16 (Excel “Unicode text”)"} — save as “CSV UTF-8” to avoid this.`];
    return json(await importService.preview(actor, { source: "csv", text, fileName: file.name.slice(0, 200), mapping, notes }), { status: 201 });
  }
  const body = await parseJson(req, importPreviewSchema);
  return json(await importService.preview(actor, body), { status: 201 });
});

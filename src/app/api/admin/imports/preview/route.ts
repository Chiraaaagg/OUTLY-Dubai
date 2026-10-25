import type { NextRequest } from "next/server";
import { importService } from "@/server/services/import.service";
import { assertSameOrigin, handle, json, parseJson, parseWith, readBodyBytes } from "@/server/lib/http";
import { RATE, requireAdmin } from "@/server/lib/guards";
import { Errors } from "@/server/lib/errors";
import { importPreviewSchema, mappingSchema } from "@/server/schemas/catalog.schemas";
import { decodeCsvBytes } from "@/server/imports/parsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD = 5 * 1024 * 1024;
/**
 * Multipart ceiling: the 5 MB file plus its part headers and boundaries and
 * the optional `mapping` field (a few KB at most — one ≤120-char header name
 * per import field). Read with a hard limit BEFORE parsing, so `formData()`
 * never buffers an unbounded body whatever Content-Length claims.
 */
const MAX_MULTIPART_BYTES = MAX_UPLOAD + 256 * 1024;
/**
 * JSON ceiling, sized to the schema's largest body: `{ source: "csv", text }`
 * with text ≤ 5,000,000 characters. A CSV is mostly ASCII, and JSON escapes
 * its quotes, backslashes and line breaks as two bytes each, so even a file
 * made only of those stays under 10 MB; the rest covers multi-byte UTF-8 text
 * and the envelope. A 500-item bulk body and a 500,000-character doc fit well
 * inside. The schema still rejects text over 5,000,000 characters after the
 * read; this only bounds what is buffered before it.
 */
const MAX_JSON_BYTES = 12 * 1024 * 1024;

/**
 * POST /api/admin/imports/preview (`imports.run`, 20/hour)
 *
 * JSON body: `{ source: "csv", text, fileName?, mapping? }` | `{ source: "sheet", url, mapping? }`
 *            | `{ source: "doc", url? | text?, mapping? }` | `{ source: "bulk", items: ActivityInput[] }`
 * Multipart: `file` (CSV, ≤5 MB; UTF-8, UTF-16 or Windows-1252) + optional `mapping` (JSON string).
 * Body ceilings: multipart MAX_MULTIPART_BYTES, JSON MAX_JSON_BYTES (413 above either).
 * Returns the batch id + per-row validation; nothing is written to products.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "imports.run", RATE.adminHeavy);
  const ct = req.headers.get("content-type") ?? "";
  if (/^multipart\/form-data\s*;/i.test(ct)) {
    const bytes = await readBodyBytes(req, MAX_MULTIPART_BYTES);
    let fd: FormData;
    try {
      fd = await new Response(bytes as BodyInit, { headers: { "content-type": ct } }).formData();
    } catch {
      throw Errors.validation({ file: "The upload could not be read — attach the CSV again" });
    }
    const file = fd.get("file");
    if (!(file instanceof File)) throw Errors.validation({ file: "Attach a CSV file" });
    if (file.size > MAX_UPLOAD) throw Errors.validation({ file: "CSV must be 5 MB or smaller" });
    if (!/\.(csv|tsv|txt)$/i.test(file.name) && !/^text\/(csv|plain|tab-separated-values)\s*(;|$)/i.test(file.type)) throw Errors.validation({ file: "Only .csv files are accepted" });
    const mappingRaw = fd.get("mapping");
    let mappingJson: unknown;
    if (typeof mappingRaw === "string" && mappingRaw) {
      try {
        mappingJson = JSON.parse(mappingRaw);
      } catch {
        throw Errors.validation({ mapping: "The column mapping is not valid JSON" });
      }
    }
    const mapping = mappingJson === undefined ? undefined : parseWith(mappingSchema, mappingJson);
    // file.text() assumes UTF-8 and turns an Excel "CSV" (Windows-1252) or "Unicode text" (UTF-16) export into mojibake.
    const { text, encoding } = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    const notes = encoding === "utf-8" ? [] : [`Read as ${encoding === "windows-1252" ? "Windows-1252 (Excel “CSV”)" : "UTF-16 (Excel “Unicode text”)"} — save as “CSV UTF-8” to avoid this.`];
    return json(await importService.preview(actor, { source: "csv", text, fileName: file.name.slice(0, 200), mapping, notes }), { status: 201 });
  }
  const body = await parseJson(req, importPreviewSchema, { maxBytes: MAX_JSON_BYTES });
  return json(await importService.preview(actor, body), { status: 201 });
});

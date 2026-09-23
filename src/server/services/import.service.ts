import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../lib/db";
import type { Actor } from "../lib/actor";
import { requirePermission } from "../lib/actor";
import { audit } from "../lib/audit";
import { Errors } from "../lib/errors";
import { uuidv7 } from "../lib/ids";
import { log } from "../lib/logger";
import { revalidateCatalog } from "../lib/catalog-cache";
import { activityInputSchema, activitySchema, buildActivityContent, projectActivity, toActivity, type ActivityInput } from "../schemas/activity.schema";
import { parseCsv, parseDocToDraft, rowToInputWithWarnings, suggestMapping, toCsv, type Mapping, type RowWarning } from "../imports/parsers";
import { resolveCategory } from "../imports/categories";

/**
 * Listing imports — CSV upload, Google Sheet link, Google Doc link/paste,
 * bulk JSON. Every import is a two-step batch:
 *
 *   preview  parse → map → validate every row → store the validated rows and
 *            per-row errors on `import_batches` (status `previewed`). Nothing
 *            touches `products`.
 *   apply    one transaction over the stored preview: create/update through
 *            `activityService` (so versions, audit and supplier mappings are
 *            identical to a manual edit) and record before/after versions per
 *            row. All-or-nothing unless `partial`.
 *   revert   one transaction: created rows are soft-deleted, updated rows get
 *            a new version equal to `before_version`. Audited.
 *
 * Google fetches are restricted to https://docs.google.com export URLs (SSRF)
 * with a 15s timeout and a 5 MB cap; the sheet/doc must be shared
 * "anyone with the link". No Google credentials are required.
 */

export type ImportSource = "csv" | "sheet" | "doc" | "bulk" | "manual";

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
}

export interface ImportPreviewRow {
  row: number;
  slug: string;
  title: string;
  action: "create" | "update";
  ok: boolean;
  input?: ActivityInput;
  errors: ImportRowError[];
  /** Normalisations and derived defaults applied to this row — shown in the preview, never blocking. */
  warnings: RowWarning[];
  /** Raw cells for failed rows so the operator can see exactly what was read. */
  raw?: Record<string, string>;
  /** Set when the row is valid except that this category does not exist yet (apply can create it). */
  missingCategory?: string;
}

export interface ImportPreview {
  batchId: string;
  source: ImportSource;
  headers: string[];
  mapping: Mapping;
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  rows: ImportPreviewRow[];
  warnings: string[];
  /** Categories referenced by otherwise-valid rows that do not exist yet. */
  missingCategories: string[];
}

const IMPORT_TX = { maxWait: 15_000, timeout: 180_000 } as const;
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;

/* ------------------------------------------------------------- google */

function googleExportUrl(raw: string, kind: "sheet" | "doc"): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Errors.validation({ url: "Not a valid URL" });
  }
  if (url.protocol === "https:" && url.hostname === "drive.google.com") {
    throw Errors.validation({ url: "This is a Drive link. Open the file in Google Sheets/Docs and paste the docs.google.com link (an uploaded .xlsx must be saved as a Google Sheet first)" });
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw Errors.validation({ url: "Only https://docs.google.com links are accepted" });
  // "Publish to the web" links carry a different id namespace (/d/e/2PACX-…) and export through /pub.
  const published = /^\/(spreadsheets|document)\/d\/e\/([a-zA-Z0-9_-]{20,})/.exec(url.pathname);
  const m = published ? null : /^\/(spreadsheets|document)\/d\/([a-zA-Z0-9_-]{10,})/.exec(url.pathname);
  const found = published ?? m;
  if (!found) {
    if (/^\/file\/d\//.test(url.pathname)) {
      throw Errors.validation({ url: "This is a Drive file link. Open the file in Google Sheets/Docs (File → Save as Google Sheets) and paste that link" });
    }
    throw Errors.validation({ url: kind === "sheet" ? "Paste the Google Sheet link (…/spreadsheets/d/<id>/…)" : "Paste the Google Doc link (…/document/d/<id>/…)" });
  }
  if (kind === "sheet" && found[1] !== "spreadsheets") throw Errors.validation({ url: "This is a Google Doc link — use the Doc import" });
  if (kind === "doc" && found[1] !== "document") throw Errors.validation({ url: "This is a Google Sheet link — use the Sheet import" });
  const id = found[2];
  // Only forward a gid the operator's link actually names. Google answers 400
  // for a gid that does not exist in the file, and "0" is not guaranteed to
  // exist (any recreated first tab gets a random gid); omitted = first tab.
  const gid = url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1] ?? null;
  const gidParam = gid && /^\d{1,12}$/.test(gid) ? `&gid=${gid}` : "";
  if (kind === "sheet") {
    return published ? `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv${gidParam}` : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gidParam}`;
  }
  return published ? `https://docs.google.com/document/d/e/${id}/pub?output=txt` : `https://docs.google.com/document/d/${id}/export?format=txt`;
}

async function fetchGoogle(exportUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(exportUrl, { signal: controller.signal, redirect: "follow", cache: "no-store", headers: { accept: "text/csv,text/plain;q=0.9,*/*;q=0.1" } });
    const finalHost = (() => {
      try {
        return new URL(res.url || exportUrl).hostname;
      } catch {
        return "";
      }
    })();
    if (!/(^|\.)google\.com$|(^|\.)googleusercontent\.com$/.test(finalHost)) throw Errors.validation({ url: "Google redirected somewhere unexpected — check the link" });
    if (res.status === 401 || res.status === 403 || /accounts\.google\.com/.test(res.url ?? "")) {
      throw Errors.validation({ url: "Google refused access — share the file as “Anyone with the link → Viewer” and try again" });
    }
    if (res.status === 400) {
      throw Errors.validation({ url: /gid=/.test(exportUrl) ? "Google returned 400 — the tab (gid) in this link does not exist in the sheet. Copy the link from the tab you want, or paste the link without #gid=…" : "Google returned 400 — this file cannot be exported. If it is an uploaded .xlsx, open it and use File → Save as Google Sheets, then share that" });
    }
    if (res.status === 404) throw Errors.validation({ url: "Google returned 404 — the file does not exist or is not shared with “Anyone with the link”" });
    if (!res.ok) throw Errors.validation({ url: `Google returned ${res.status} — check the link is correct and shared` });
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > FETCH_MAX_BYTES) throw Errors.validation({ url: "File is larger than 5 MB" });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > FETCH_MAX_BYTES) throw Errors.validation({ url: "File is larger than 5 MB" });
    const text = buf.toString("utf8").replace(/^\uFEFF/, "");
    if (/<html/i.test(text.slice(0, 500))) throw Errors.validation({ url: "Google returned a web page instead of the file — it is probably not shared publicly" });
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw Errors.validation({ url: "Google took too long to respond — try again" });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGoogleSheetCsv(url: string): Promise<string> {
  return fetchGoogle(googleExportUrl(url, "sheet"));
}

export async function fetchGoogleDocText(url: string): Promise<string> {
  return fetchGoogle(googleExportUrl(url, "doc"));
}

/* ------------------------------------------------------------ helpers */

function issuesToErrors(row: number, issues: { path: PropertyKey[]; message: string }[]): ImportRowError[] {
  return issues.slice(0, 12).map((i) => ({ row, field: i.path.map(String).join(".") || "_", message: i.message }));
}

interface Candidate {
  row: number;
  input: Record<string, unknown>;
  warnings: RowWarning[];
  raw?: Record<string, string>;
}

async function validateCandidates(candidates: Candidate[]): Promise<ImportPreviewRow[]> {
  const slugs = candidates.map((c) => (typeof c.input.slug === "string" ? c.input.slug : "")).filter(Boolean);
  const [existing, categories] = await Promise.all([
    prisma.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, deletedAt: true } }),
    prisma.category.findMany({ where: { deletedAt: null, status: { not: "archived" } }, select: { slug: true, name: true, shortName: true } }),
  ]);
  const existingBySlug = new Map(existing.map((e) => [e.slug, e]));
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const seen = new Map<string, number>();
  const rows: ImportPreviewRow[] = [];
  for (const c of candidates) {
    const warnings = [...c.warnings];
    // Category vocabulary: resolve supplier taxonomy onto ours before validation.
    const rawCat = typeof c.input.categorySlug === "string" ? c.input.categorySlug : "";
    const rawTitle = typeof c.input.title === "string" ? c.input.title : "";
    if (rawCat && !categorySlugs.has(rawCat)) {
      const r = resolveCategory(rawCat, rawTitle, categories);
      if (r.slug) {
        c.input.categorySlug = r.slug;
        warnings.push({ field: "categorySlug", message: `"${rawCat}" → ${r.slug} (matched by ${r.how})` });
      }
    }
    const parsed = activityInputSchema.safeParse(c.input);
    const errors: ImportRowError[] = parsed.success ? [] : issuesToErrors(c.row, parsed.error.issues);
    const slug = parsed.success ? parsed.data.slug : typeof c.input.slug === "string" ? c.input.slug : "";
    const title = parsed.success ? parsed.data.title : rawTitle;
    const catNow = parsed.success ? parsed.data.categorySlug : typeof c.input.categorySlug === "string" ? c.input.categorySlug : "";
    if (catNow && !categorySlugs.has(catNow)) errors.push({ row: c.row, field: "categorySlug", message: `Unknown category "${catNow}" — use one of: ${[...categorySlugs].join(", ")}` });
    if (slug) {
      const dup = seen.get(slug);
      if (dup !== undefined) errors.push({ row: c.row, field: "slug", message: `Duplicate slug in this file (also row ${dup})` });
      seen.set(slug, c.row);
    }
    const ex = existingBySlug.get(slug);
    if (ex?.deletedAt) errors.push({ row: c.row, field: "slug", message: "This slug belongs to a deleted activity — restore it from the console instead" });
    const ok = errors.length === 0;
    const onlyCategory = !ok && parsed.success && errors.every((e) => e.field === "categorySlug");
    rows.push({
      row: c.row,
      slug,
      title,
      action: ex && !ex.deletedAt ? "update" : "create",
      ok,
      // Kept for rows whose only problem is an unknown category so apply can create it on request.
      input: parsed.success && (ok || onlyCategory) ? parsed.data : undefined,
      missingCategory: onlyCategory ? catNow : undefined,
      errors,
      warnings,
      raw: ok ? undefined : c.raw,
    });
  }
  return rows;
}

function toPreview(batchId: string, source: ImportSource, headers: string[], mapping: Mapping, rows: ImportPreviewRow[], warnings: string[]): ImportPreview {
  const ok = rows.filter((r) => r.ok).length;
  const missingCategories = [...new Set(rows.map((r) => r.missingCategory).filter((x): x is string => Boolean(x)))].sort();
  return { batchId, source, headers, mapping, rowsTotal: rows.length, rowsOk: ok, rowsFailed: rows.length - ok, rows, warnings, missingCategories };
}

/* ------------------------------------------------------------- service */

export const importService = {
  /** Headers + first rows from a Google Sheet, or the parsed draft from a Google Doc — for the mapping step. */
  async fetch(actor: Actor, url: string) {
    requirePermission(actor, "imports.run");
    if (/\/spreadsheets\//.test(url)) {
      const table = parseCsv(await fetchGoogleSheetCsv(url));
      return { kind: "sheet" as const, headers: table.headers, sample: table.rows.slice(0, 5), rows: table.rows.length, mapping: suggestMapping(table.headers) };
    }
    const draft = parseDocToDraft(await fetchGoogleDocText(url));
    return { kind: "doc" as const, draft: draft.input, warnings: draft.warnings, sections: Object.keys(draft.sections) };
  },

  async preview(
    actor: Actor,
    req:
      | { source: "csv"; text: string; fileName?: string; mapping?: Mapping }
      | { source: "sheet"; url: string; mapping?: Mapping }
      | { source: "doc"; url?: string; text?: string; mapping?: Mapping }
      | { source: "bulk"; items: unknown[] },
  ): Promise<ImportPreview> {
    requirePermission(actor, "imports.run");
    if (!actor.id) throw Errors.unauthorized();

    let headers: string[] = [];
    let mapping: Mapping = {};
    let candidates: Candidate[] = [];
    const warnings: string[] = [];
    let fileName: string | undefined;
    let sourceRef: string | undefined;

    if (req.source === "csv" || req.source === "sheet") {
      const text = req.source === "csv" ? req.text : await fetchGoogleSheetCsv(req.url);
      fileName = req.source === "csv" ? req.fileName : undefined;
      sourceRef = req.source === "sheet" ? req.url : undefined;
      const table = parseCsv(text);
      if (table.headers.length === 0) throw Errors.validation({ file: "The file is empty" });
      if (table.rows.length === 0) throw Errors.validation({ file: "The file has a header row but no data rows" });
      if (table.rows.length > MAX_ROWS) throw Errors.validation({ file: `Up to ${MAX_ROWS} rows per import — split the file` });
      headers = table.headers;
      mapping = { ...suggestMapping(headers), ...(req.mapping ?? {}) };
      for (const [f, h] of Object.entries(mapping)) if (h && !headers.includes(h)) throw Errors.validation({ [`mapping.${f}`]: `Column "${h}" is not in the file` });
      if (!mapping.title && !mapping.slug) throw Errors.validation({ mapping: "Map at least a Title (or Slug) column" });
      candidates = table.rows.map((r, i) => {
        const { input, warnings: w } = rowToInputWithWarnings(headers, r, mapping);
        const raw: Record<string, string> = {};
        headers.forEach((h, j) => {
          if (r[j]) raw[h] = r[j].length > 300 ? r[j].slice(0, 300) + "…" : r[j];
        });
        return { row: i + 2, input, warnings: w, raw };
      });
    } else if (req.source === "doc") {
      const text = req.text ?? (req.url ? await fetchGoogleDocText(req.url) : "");
      if (!text.trim()) throw Errors.validation({ text: "Paste the document text or a Google Doc link" });
      sourceRef = req.url;
      const draft = parseDocToDraft(text);
      warnings.push(...draft.warnings);
      headers = Object.keys(draft.sections);
      candidates = [{ row: 1, input: draft.input, warnings: [] }];
    } else {
      if (req.items.length > MAX_ROWS) throw Errors.validation({ items: `Up to ${MAX_ROWS} items per import` });
      candidates = req.items.map((item, i) => ({ row: i + 1, input: item && typeof item === "object" ? (item as Record<string, unknown>) : {}, warnings: [] }));
    }

    const rows = await validateCandidates(candidates);
    const id = uuidv7();
    const ok = rows.filter((r) => r.ok).length;
    await prisma.importBatch.create({
      data: {
        id,
        source: req.source,
        status: "previewed",
        fileName,
        sourceRef,
        mapping: mapping as Prisma.InputJsonValue,
        rowsTotal: rows.length,
        rowsOk: ok,
        rowsFailed: rows.length - ok,
        errors: rows.flatMap((r) => r.errors) as unknown as Prisma.InputJsonValue,
        preview: rows.map((r) => ({ row: r.row, slug: r.slug, title: r.title, action: r.action, ok: r.ok, input: r.input ?? null, warnings: r.warnings, raw: r.raw ?? null, missingCategory: r.missingCategory ?? null })) as unknown as Prisma.InputJsonValue,
        createdBy: actor.id,
      },
    });
    await audit(actor, "import.preview", { type: "import_batch", id }, { after: { source: req.source, rowsTotal: rows.length, rowsOk: ok, fileName, sourceRef } });
    return toPreview(id, req.source, headers, mapping, rows, warnings);
  },

  /**
   * Apply a previewed batch in ONE transaction with a fixed number of round
   * trips, not one per row: on a remote Postgres every query costs a full
   * round trip, and the per-row path (8 queries × 200 rows) blew the
   * transaction budget. Creates are bulk-inserted; updates are one UPDATE
   * each plus bulk version/audit rows. Supplier + mapping rows and the audit
   * trail are written exactly as `activityService` would.
   */
  async apply(actor: Actor, batchId: string, opts: { partial?: boolean; publish?: boolean; reason?: string; createMissingCategories?: boolean } = {}) {
    requirePermission(actor, "imports.run");
    if (opts.publish) requirePermission(actor, "products.publish");
    if (opts.createMissingCategories) requirePermission(actor, "categories.edit");
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw Errors.notFound("Import batch");
    if (batch.status !== "previewed") throw Errors.conflict(`This batch was already ${batch.status}`);
    type StoredRow = { row: number; slug: string; action: "create" | "update"; ok: boolean; input: unknown; missingCategory?: string | null };
    const preview = (Array.isArray(batch.preview) ? batch.preview : []) as StoredRow[];

    const usable = (r: StoredRow) => r.ok || (Boolean(opts.createMissingCategories) && Boolean(r.input) && Boolean(r.missingCategory));
    const failed = preview.filter((r) => !usable(r)).length;
    if (failed > 0 && !opts.partial) {
      throw Errors.conflict(`${failed} rows have errors — fix the file and preview again, or apply with "skip failed rows"`, { rowsFailed: failed });
    }
    const todo = preview.filter((r) => usable(r) && r.input);
    if (todo.length === 0) throw Errors.conflict("No valid rows to apply");

    const reason = opts.reason ?? `import ${batch.source}${batch.fileName ? ` ${batch.fileName}` : ""}`;
    const status = opts.publish ? "published" : "draft";
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Re-parse: the preview was validated, but the stored JSON is re-checked against a tampered row.
      const inputs = todo.map((r) => ({ row: r.row, input: activityInputSchema.parse(r.input) }));

      // Categories — create the missing ones as drafts when asked.
      const wanted = [...new Set(inputs.map((i) => i.input.categorySlug))];
      const existingCats = new Set((await tx.category.findMany({ where: { slug: { in: wanted }, deletedAt: null }, select: { slug: true } })).map((c) => c.slug));
      const missing = wanted.filter((c) => !existingCats.has(c));
      if (missing.length && !opts.createMissingCategories) throw Errors.validation({ categorySlug: `Unknown categories: ${missing.join(", ")}` });
      if (missing.length) {
        const cats = missing.map((slug) => ({ id: uuidv7(), slug, name: slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), shortName: slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").slice(0, 30), heroImage: `img:category:${slug}:0`, status: "draft", sortOrder: 900 }));
        await tx.category.createMany({ data: cats, skipDuplicates: true });
        await tx.auditLog.createMany({ data: cats.map((c) => ({ actorType: actor.type, actorId: actor.id, action: "category.create", entityType: "category", entityId: c.id, after: { slug: c.slug, status: "draft", source: "import" } as Prisma.InputJsonValue, reason, ipHash: actor.ipHash, userAgent: actor.userAgent })) });
      }

      // Existing products by slug — one query.
      const slugs = inputs.map((i) => i.input.slug);
      const existing = new Map((await tx.product.findMany({ where: { slug: { in: slugs } } })).map((p) => [p.slug, p]));
      const deleted = inputs.find((i) => existing.get(i.input.slug)?.deletedAt);
      if (deleted) throw Errors.conflict(`Row ${deleted.row}: slug "${deleted.input.slug}" belongs to a deleted activity — restore it from the console instead`);

      // Suppliers — one upsert per distinct supplier (a handful), one mapping query.
      const supplierIds = new Map<string, string>();
      for (const sup of new Map(inputs.map((i) => [i.input.supplier.name, i.input.supplier])).values()) {
        const code = sup.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || sup.id;
        const row = await tx.supplier.upsert({
          where: { code },
          create: { id: uuidv7(), code, name: sup.name, source: sup.source === "direct" ? "direct" : sup.source === "portal" ? "portal" : "api", adapter: "manual", capabilities: { availability: false, booking: false, cancellation: false, lookup: false }, reliabilityScore: sup.reliability },
          update: { name: sup.name, reliabilityScore: sup.reliability },
          select: { id: true },
        });
        supplierIds.set(sup.name, row.id);
      }

      const items: { slug: string; action: "create" | "update"; before: number | null; after: number; id: string }[] = [];
      const creates: Prisma.ProductCreateManyInput[] = [];
      const versions: Prisma.ProductVersionCreateManyInput[] = [];
      const audits: Prisma.AuditLogCreateManyInput[] = [];
      const mappings: { productId: string; supplierId: string }[] = [];

      for (const { input } of inputs) {
        const prev = existing.get(input.slug);
        const supplierId = supplierIds.get(input.supplier.name);
        if (prev) {
          const prevDoc = activitySchema.safeParse(prev.content);
          const derived = prevDoc.success
            ? { id: prevDoc.data.id, rating: prevDoc.data.rating, reviewCount: prevDoc.data.reviewCount, bookedThisMonth: prevDoc.data.bookedThisMonth }
            : { id: prev.id, rating: Number(prev.rating ?? 0), reviewCount: prev.reviewCount ?? 0, bookedThisMonth: 0 };
          const content = buildActivityContent({ ...input, fulfilmentMode: prev.fulfilmentMode }, derived);
          const version = prev.version + 1;
          // "Publish immediately" means every row in the batch, not only the
          // new ones: re-importing a sheet over existing drafts is the normal
          // way a catalogue goes live, and leaving those rows draft made the
          // checkbox look broken.
          const rowStatus = opts.publish ? "published" : prev.status;
          await tx.product.update({
            where: { id: prev.id },
            data: {
              ...projectActivity(content),
              content: content as unknown as Prisma.InputJsonValue,
              version,
              status: rowStatus,
              publishedAt: rowStatus === "published" ? (prev.publishedAt ?? now) : prev.publishedAt,
            },
          });
          versions.push({ id: uuidv7(), productId: prev.id, version, content: content as unknown as Prisma.InputJsonValue, status: rowStatus, actorId: actor.id, reason });
          audits.push({ actorType: actor.type, actorId: actor.id, action: "activity.update", entityType: "product", entityId: prev.id, before: { version: prev.version, title: prev.title, status: prev.status } as Prisma.InputJsonValue, after: { version, title: content.title, status: rowStatus, source: "import" } as Prisma.InputJsonValue, reason, ipHash: actor.ipHash, userAgent: actor.userAgent });
          if (supplierId) mappings.push({ productId: prev.id, supplierId });
          items.push({ slug: input.slug, action: "update", before: prev.version, after: version, id: prev.id });
        } else {
          const id = uuidv7();
          const content = buildActivityContent({ ...input, fulfilmentMode: "inquiry" }, { id, rating: 0, reviewCount: 0, bookedThisMonth: 0 });
          creates.push({ id, slug: content.slug, ...projectActivity(content), content: content as unknown as Prisma.InputJsonValue, status, version: 1, fulfilmentMode: "inquiry", publishedAt: status === "published" ? now : null });
          versions.push({ id: uuidv7(), productId: id, version: 1, content: content as unknown as Prisma.InputJsonValue, status, actorId: actor.id, reason });
          audits.push({ actorType: actor.type, actorId: actor.id, action: "activity.create", entityType: "product", entityId: id, after: { slug: content.slug, title: content.title, status, source: "import" } as Prisma.InputJsonValue, reason, ipHash: actor.ipHash, userAgent: actor.userAgent });
          if (supplierId) mappings.push({ productId: id, supplierId });
          items.push({ slug: input.slug, action: "create", before: null, after: 1, id });
        }
      }

      if (creates.length) await tx.product.createMany({ data: creates });
      if (versions.length) await tx.productVersion.createMany({ data: versions });
      if (mappings.length) {
        const have = new Set((await tx.productSupplierMapping.findMany({ where: { productId: { in: mappings.map((m) => m.productId) }, variantCode: null }, select: { productId: true, supplierId: true } })).map((m) => `${m.productId}:${m.supplierId}`));
        const fresh = mappings.filter((m) => !have.has(`${m.productId}:${m.supplierId}`));
        if (fresh.length) await tx.productSupplierMapping.createMany({ data: fresh.map((m) => ({ id: uuidv7(), productId: m.productId, supplierId: m.supplierId, priority: 1, externalRef: {} })) });
      }
      await tx.importBatchItem.createMany({ data: items.map((i) => ({ id: uuidv7(), batchId, productId: i.id, action: i.action, beforeVersion: i.before, afterVersion: i.after, slug: i.slug })) });
      await tx.importBatch.update({ where: { id: batchId }, data: { status: "applied", appliedAt: now, rowsOk: items.length, rowsFailed: preview.length - items.length } });
      audits.push({ actorType: actor.type, actorId: actor.id, action: "import.apply", entityType: "import_batch", entityId: batchId, after: { applied: items.length, created: creates.length, updated: items.length - creates.length, publish: Boolean(opts.publish), categoriesCreated: missing } as Prisma.InputJsonValue, reason, ipHash: actor.ipHash, userAgent: actor.userAgent });
      await tx.auditLog.createMany({ data: audits });
      return { items, categoriesCreated: missing };
    }, IMPORT_TX).catch(async (error) => {
      await prisma.importBatch.update({ where: { id: batchId }, data: { status: "failed", errors: [{ row: 0, field: "_", message: error instanceof Error ? error.message : "apply failed" }] as unknown as Prisma.InputJsonValue } }).catch(() => {});
      log.error("import.apply_failed", { batchId, error });
      throw error;
    });
    revalidateCatalog();
    const created = result.items.filter((i) => i.action === "create").length;
    return { batchId, applied: result.items.length, created, updated: result.items.length - created, published: opts.publish ? result.items.length : 0, categoriesCreated: result.categoriesCreated, items: result.items };
  },

  async revert(actor: Actor, batchId: string, reason?: string) {
    requirePermission(actor, "imports.run");
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { items: true } });
    if (!batch) throw Errors.notFound("Import batch");
    if (batch.status !== "applied") throw Errors.conflict(`Only applied batches can be reverted (this one is ${batch.status})`);
    const why = reason ?? `revert import ${batchId.slice(0, 8)}`;
    await prisma.$transaction(async (tx: Tx) => {
      for (const item of batch.items) {
        if (item.action === "create") {
          const p = await tx.product.findUnique({ where: { id: item.productId }, select: { deletedAt: true } });
          if (p && !p.deletedAt) await removeInTx(tx, actor, item.productId, why);
        } else if (item.beforeVersion != null) {
          await restoreInTx(tx, actor, item.productId, item.beforeVersion, why);
        }
      }
      await tx.importBatch.update({ where: { id: batchId }, data: { status: "reverted", revertedAt: new Date() } });
      await audit(actor, "import.revert", { type: "import_batch", id: batchId }, { after: { reverted: batch.items.length }, reason: why }, tx);
    }, IMPORT_TX);
    revalidateCatalog();
    return { batchId, reverted: batch.items.length };
  },

  async list(actor: Actor, page = 1) {
    requirePermission(actor, "imports.run");
    const pageSize = 25;
    const [rows, total] = await Promise.all([
      prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, source: true, status: true, fileName: true, sourceRef: true, rowsTotal: true, rowsOk: true, rowsFailed: true, createdBy: true, createdAt: true, appliedAt: true, revertedAt: true } }),
      prisma.importBatch.count(),
    ]);
    return { rows, total, page, pageSize };
  },

  async get(actor: Actor, batchId: string) {
    requirePermission(actor, "imports.run");
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { items: { orderBy: { slug: "asc" } } } });
    if (!batch) throw Errors.notFound("Import batch");
    return batch;
  },

  /** Export every non-deleted activity as an import-compatible CSV (template + round-trip). */
  async exportCsv(actor: Actor) {
    requirePermission(actor, "products.edit");
    const rows = await prisma.product.findMany({ where: { deletedAt: null }, select: { content: true, slug: true }, orderBy: { slug: "asc" } });
    const items: ActivityInput[] = [];
    for (const r of rows) {
      const c = r.content as Record<string, unknown>;
      const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest } = c;
      const parsed = activityInputSchema.safeParse(rest);
      if (parsed.success) items.push(parsed.data);
    }
    return toCsv(items);
  },
};

/* Revert helpers — the same rules as activityService.remove / restoreVersion, inside the caller's transaction. */

async function removeInTx(tx: Tx, actor: Actor, id: string, reason: string) {
  const before = await tx.product.findUnique({ where: { id } });
  if (!before || before.deletedAt) return;
  const version = before.version + 1;
  await tx.product.update({ where: { id }, data: { deletedAt: new Date(), status: "archived", version } });
  await tx.productVersion.create({ data: { id: uuidv7(), productId: id, version, content: before.content as Prisma.InputJsonValue, status: "archived", actorId: actor.id, reason } });
  await audit(actor, "activity.delete", { type: "product", id }, { before: { status: before.status }, after: { status: "archived", deletedAt: true }, reason }, tx);
}

async function restoreInTx(tx: Tx, actor: Actor, id: string, version: number, reason: string) {
  const before = await tx.product.findUnique({ where: { id } });
  if (!before) return;
  const old = await tx.productVersion.findUnique({ where: { productId_version: { productId: id, version } } });
  if (!old) throw Errors.conflict(`Version ${version} of ${before.slug} is missing — cannot revert`);
  const restored = { ...toActivity(old.content), fulfilmentMode: before.fulfilmentMode };
  const next = before.version + 1;
  await tx.product.update({ where: { id }, data: { slug: restored.slug, ...projectActivity(restored), content: restored as unknown as Prisma.InputJsonValue, version: next } });
  await tx.productVersion.create({ data: { id: uuidv7(), productId: id, version: next, content: restored as unknown as Prisma.InputJsonValue, status: before.status, actorId: actor.id, reason } });
  await audit(actor, "activity.restore_version", { type: "product", id }, { before: { version: before.version }, after: { version: next, restoredFrom: version }, reason }, tx);
}

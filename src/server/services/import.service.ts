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
import { activityInputSchema, activitySchema, buildActivityContent, projectActivity, toActivity, type ActivityInput, type ImportField } from "../schemas/activity.schema";
import { completeNewActivity, currencyIn, matchHeader, mergeIntoExisting, parseCsv, parseDocToDraft, readRow, slugify, suggestMapping, toCsv, type Mapping, type RowRead, type RowWarning } from "../imports/parsers";
import { resolveCategory } from "../imports/categories";
import { googleExportUrl } from "../imports/google";

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
  /** The cell as read, when the error is about one cell. */
  cell?: string;
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
  /** A derived value needs a person's check: "publish immediately" leaves this row a draft. */
  review?: boolean;
  /** Version of the listing the update was computed from; apply refuses if it moved since. */
  baseVersion?: number;
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

/**
 * A row on its way to validation. Sheet/CSV/Doc rows carry what their cells
 * stated (`read`): create vs update decides what blank cells become. Bulk
 * JSON items are whole documents (`input`) and are validated as given.
 */
interface Candidate {
  row: number;
  read?: RowRead;
  input?: Record<string, unknown>;
  raw?: Record<string, string>;
}

const DERIVED_KEYS = ["id", "rating", "reviewCount", "bookedThisMonth"] as const;

/** Stored document → the editable input it was built from (derived fields and the hinge stripped by the schema). */
function storedInput(content: unknown): ActivityInput | null {
  if (!content || typeof content !== "object") return null;
  const rest = { ...(content as Record<string, unknown>) };
  for (const k of DERIVED_KEYS) delete rest[k];
  const parsed = activityInputSchema.safeParse(rest);
  return parsed.success ? parsed.data : null;
}

/** Category resolution onto the live taxonomy; a guess from the title alone is flagged for review. */
function resolveCategories(input: Record<string, unknown>, warnings: RowWarning[], categories: { slug: string; name: string; shortName: string }[], unknownSecondary: string[]) {
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const rawCat = typeof input.categorySlug === "string" ? input.categorySlug : "";
  const title = typeof input.title === "string" ? input.title : "";
  if (rawCat && !categorySlugs.has(rawCat)) {
    const r = resolveCategory(rawCat, title, categories);
    if (r.slug) {
      input.categorySlug = r.slug;
      warnings.push({ field: "categorySlug", message: `"${rawCat}" → ${r.slug} (matched by ${r.how})`, ...(r.how === "title" ? { review: true } : {}) });
    }
  }
  if (Array.isArray(input.secondaryCategorySlugs)) {
    const out: string[] = [];
    for (const s of input.secondaryCategorySlugs as string[]) {
      const r = categorySlugs.has(s) ? { slug: s, how: "exact" } : resolveCategory(s, "", categories);
      if (!r.slug) unknownSecondary.push(s);
      else {
        if (r.slug !== s) warnings.push({ field: "secondaryCategorySlugs", message: `"${s}" → ${r.slug} (matched by ${r.how})` });
        if (r.slug !== input.categorySlug && !out.includes(r.slug)) out.push(r.slug);
      }
    }
    input.secondaryCategorySlugs = out;
  }
}

async function validateCandidates(candidates: Candidate[]): Promise<ImportPreviewRow[]> {
  const slugOf = (c: Candidate) => {
    const v = c.read?.input ?? c.input ?? {};
    return typeof v.slug === "string" && v.slug ? v.slug : typeof v.title === "string" ? slugify(v.title) : "";
  };
  const slugs = candidates.map(slugOf).filter(Boolean);
  const [existing, categories] = await Promise.all([
    prisma.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, deletedAt: true, content: true, version: true, status: true } }),
    prisma.category.findMany({ where: { deletedAt: null, status: { not: "archived" } }, select: { slug: true, name: true, shortName: true } }),
  ]);
  const existingBySlug = new Map(existing.map((e) => [e.slug, e]));
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const seen = new Map<string, number>();
  const rows: ImportPreviewRow[] = [];
  for (const c of candidates) {
    const slugGuess = slugOf(c);
    const ex = existingBySlug.get(slugGuess);
    const isUpdate = Boolean(ex && !ex.deletedAt);
    const errors: ImportRowError[] = [];
    let warnings: RowWarning[] = [];
    let input: Record<string, unknown>;
    if (c.read) {
      const read = c.read;
      if (isUpdate) {
        const explicitSlug = typeof read.input.slug === "string";
        const current = storedInput(ex!.content);
        if (current) mergeIntoExisting(current, read);
        else errors.push({ row: c.row, field: "slug", message: "The existing listing with this slug has no valid content document — fix it in the editor first" });
        if (!read.input.slug) read.input.slug = slugGuess;
        if (!explicitSlug) read.warnings.push({ field: "slug", message: `no slug — matched the existing listing “${slugGuess}” by its title, so this row UPDATES it; add a slug column if it is a different activity`, review: true });
      } else completeNewActivity(read);
      errors.push(...read.errors.map((e) => ({ row: c.row, ...e })));
      warnings = read.warnings;
      input = read.input;
    } else input = c.input ?? {};

    const unknownSecondary: string[] = [];
    resolveCategories(input, warnings, categories, unknownSecondary);
    if (unknownSecondary.length) errors.push({ row: c.row, field: "secondaryCategorySlugs", message: `Unknown categor${unknownSecondary.length === 1 ? "y" : "ies"} ${unknownSecondary.map((s) => `"${s}"`).join(", ")} — use one of: ${[...categorySlugs].join(", ")}` });

    const parsed = activityInputSchema.safeParse(input);
    // A cell already reported as unreadable or missing is not reported again as "expected number, received undefined",
    // nor is what was to be derived from it (no subtitle → no SEO description).
    const reported = errors.map((e) => e.field).flatMap((f) => (f === "subtitle" ? [f, "seo.description"] : [f]));
    if (!parsed.success) errors.push(...issuesToErrors(c.row, parsed.error.issues).filter((e) => !reported.some((f) => e.field === f || e.field.startsWith(`${f}.`) || f.startsWith(`${e.field}.`))));
    const slug = parsed.success ? parsed.data.slug : typeof input.slug === "string" ? input.slug : "";
    const title = parsed.success ? parsed.data.title : typeof input.title === "string" ? input.title : "";
    const catNow = parsed.success ? parsed.data.categorySlug : typeof input.categorySlug === "string" ? input.categorySlug : "";
    if (catNow && !categorySlugs.has(catNow)) errors.push({ row: c.row, field: "categorySlug", message: `Unknown category "${catNow}" — use one of: ${[...categorySlugs].join(", ")}` });
    if (slug) {
      const dup = seen.get(slug);
      if (dup !== undefined) errors.push({ row: c.row, field: "slug", message: `Duplicate slug in this file (also row ${dup})` });
      seen.set(slug, c.row);
    }
    const exNow = existingBySlug.get(slug);
    if (exNow?.deletedAt) errors.push({ row: c.row, field: "slug", message: "This slug belongs to a deleted activity — restore it from the console instead" });
    const ok = errors.length === 0;
    const onlyCategory = !ok && parsed.success && errors.every((e) => e.field === "categorySlug");
    const update = Boolean(exNow && !exNow.deletedAt);
    const review = warnings.some((w) => w.review);
    if (update && review && exNow!.status === "published") warnings.push({ field: "status", message: "this listing is live — applying puts these values on the site now; check the ⚑ notes before applying" });
    rows.push({
      row: c.row,
      slug,
      title,
      action: update ? "update" : "create",
      ok,
      // Kept for rows whose only problem is an unknown category so apply can create it on request.
      input: parsed.success && (ok || onlyCategory) ? parsed.data : undefined,
      missingCategory: onlyCategory ? catNow : undefined,
      errors,
      warnings,
      raw: ok ? undefined : c.raw,
      review: review || undefined,
      baseVersion: update ? exNow!.version : undefined,
    });
  }
  return rows;
}

/**
 * Mapping sanity before any row is read: a column whose name states one
 * currency mapped onto the other currency's price would misprice every row,
 * so it stops the preview; a price column with no currency in its name is
 * read as INR and said so.
 */
function checkMapping(headers: string[], mapping: Mapping, warnings: string[]) {
  for (const [f, h] of Object.entries(mapping) as [ImportField, string | null][]) {
    if (!h || !f.startsWith("price.")) continue;
    const want = f.endsWith(".inr") ? "inr" : "aed";
    const named = currencyIn(h);
    if (named && named !== want) throw Errors.validation({ [`mapping.${f}`]: `Column "${h}" is in ${named.toUpperCase()} but is mapped to the ${want.toUpperCase()} price ${f}` });
    if (!named && want === "inr" && matchHeader(h)?.assumedCurrency) warnings.push(`Column “${h}” names no currency, so it is read as INR (₹). If it holds dirhams, rename it “${h} (AED)” or map it to the AED price.`);
  }
  const unmapped = headers.filter((h) => !Object.values(mapping).includes(h));
  if (unmapped.length) warnings.push(`Not imported (no field mapped): ${unmapped.slice(0, 12).map((h) => `“${h}”`).join(", ")}${unmapped.length > 12 ? ` and ${unmapped.length - 12} more` : ""}.`);
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
      return { kind: "sheet" as const, headers: table.headers, sample: table.rows.slice(0, 5), rows: table.rows.length, mapping: suggestMapping(table.headers), notes: table.notes ?? [] };
    }
    const draft = parseDocToDraft(await fetchGoogleDocText(url));
    return { kind: "doc" as const, draft: draft.input, warnings: draft.warnings, sections: Object.keys(draft.sections) };
  },

  async preview(
    actor: Actor,
    req:
      | { source: "csv"; text: string; fileName?: string; mapping?: Mapping; notes?: string[] }
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
      if (req.source === "csv" && req.notes) warnings.push(...req.notes);
      const table = parseCsv(text);
      warnings.push(...(table.notes ?? []));
      if (table.headers.length === 0) throw Errors.validation({ file: "The file is empty" });
      if (table.rows.length === 0) throw Errors.validation({ file: "The file has a header row but no data rows — add one row per activity under the header" });
      if (table.rows.length > MAX_ROWS) throw Errors.validation({ file: `Up to ${MAX_ROWS} rows per import — split the file` });
      headers = table.headers;
      mapping = { ...suggestMapping(headers), ...(req.mapping ?? {}) };
      for (const [f, h] of Object.entries(mapping)) if (h && !headers.includes(h)) throw Errors.validation({ [`mapping.${f}`]: `Column "${h}" is not in the file — the mapping is from another file; reset it and preview again` });
      if (!mapping.title && !mapping.slug) throw Errors.validation({ mapping: "Map at least a Title (or Slug) column" });
      checkMapping(headers, mapping, warnings);
      candidates = table.rows.map((r, i) => {
        const raw: Record<string, string> = {};
        headers.forEach((h, j) => {
          if (r[j]) raw[h] = r[j].length > 300 ? r[j].slice(0, 300) + "…" : r[j];
        });
        return { row: i + 2, read: readRow(headers, r, mapping), raw };
      });
    } else if (req.source === "doc") {
      const text = req.text ?? (req.url ? await fetchGoogleDocText(req.url) : "");
      if (!text.trim()) throw Errors.validation({ text: "Paste the document text or a Google Doc link" });
      sourceRef = req.url;
      const draft = parseDocToDraft(text);
      warnings.push(...draft.warnings);
      headers = Object.keys(draft.sections);
      mapping = draft.table.mapping;
      candidates = [{ row: 1, read: readRow(draft.table.headers, draft.table.row, draft.table.mapping) }];
    } else {
      if (req.items.length > MAX_ROWS) throw Errors.validation({ items: `Up to ${MAX_ROWS} items per import` });
      candidates = req.items.map((item, i) => ({ row: i + 1, input: item && typeof item === "object" ? (item as Record<string, unknown>) : {} }));
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
        preview: rows.map((r) => ({ row: r.row, slug: r.slug, title: r.title, action: r.action, ok: r.ok, input: r.input ?? null, warnings: r.warnings, raw: r.raw ?? null, missingCategory: r.missingCategory ?? null, review: r.review ?? false, baseVersion: r.baseVersion ?? null })) as unknown as Prisma.InputJsonValue,
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
    type StoredRow = { row: number; slug: string; action: "create" | "update"; ok: boolean; input: unknown; missingCategory?: string | null; review?: boolean; baseVersion?: number | null };
    const preview = (Array.isArray(batch.preview) ? batch.preview : []) as StoredRow[];

    const usable = (r: StoredRow) => r.ok || (Boolean(opts.createMissingCategories) && Boolean(r.input) && Boolean(r.missingCategory));
    const failed = preview.filter((r) => !usable(r)).length;
    if (failed > 0 && !opts.partial) {
      throw Errors.conflict(`${failed} rows have errors — fix the file and preview again, or apply with "skip failed rows"`, { rowsFailed: failed });
    }
    const todo = preview.filter((r) => usable(r) && r.input);
    if (todo.length === 0) throw Errors.conflict("No valid rows to apply");

    const reason = opts.reason ?? `import ${batch.source}${batch.fileName ? ` ${batch.fileName}` : ""}`;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Claim the batch first: of two concurrent Apply clicks only one gets past this line; the other
      // waits on the row lock, finds it no longer "previewed" and stops without writing anything.
      const claimed = await tx.importBatch.updateMany({ where: { id: batchId, status: "previewed" }, data: { status: "applied", appliedAt: now } });
      if (claimed.count !== 1) throw Errors.conflict("This batch is being applied or was already applied");
      // Re-parse: the preview was validated, but the stored JSON is re-checked against a tampered row.
      const inputs = todo.map((r) => ({ row: r.row, input: activityInputSchema.parse(r.input) }));
      const heldSlugs: string[] = [];

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
      // An update row was merged onto the listing as it was at preview time; if someone saved it since, applying would undo their edit.
      const moved = todo.filter((r) => r.baseVersion != null && existing.get(r.slug) && existing.get(r.slug)!.version !== r.baseVersion);
      if (moved.length) throw Errors.conflict(`${moved.map((r) => `"${r.slug}"`).join(", ")} changed after this preview — preview the file again`, { slugs: moved.map((r) => r.slug) });
      const created = todo.find((r) => r.action === "create" && existing.has(r.slug));
      if (created) throw Errors.conflict(`Row ${created.row}: "${created.slug}" was created after this preview — preview the file again`);
      // Rows with derived values a person must check stay drafts even when the batch is published.
      const held = new Set(opts.publish ? todo.filter((r) => r.review).map((r) => r.row) : []);

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

      for (const { row, input } of inputs) {
        const prev = existing.get(input.slug);
        const publishRow = Boolean(opts.publish) && !held.has(row);
        // "Held" = this import did not publish it. A listing that is already live stays live with the new values;
        // the preview marks those rows so nobody reads "held" as "not on the site".
        if (opts.publish && held.has(row) && prev?.status !== "published") heldSlugs.push(input.slug);
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
          const rowStatus = publishRow ? "published" : prev.status;
          // Version-guarded write: a save that lands between the read above and this write makes the count 0.
          const written = await tx.product.updateMany({
            where: { id: prev.id, version: prev.version, deletedAt: null },
            data: {
              ...projectActivity(content),
              content: content as unknown as Prisma.InputJsonValue,
              version,
              status: rowStatus,
              publishedAt: rowStatus === "published" ? (prev.publishedAt ?? now) : prev.publishedAt,
            },
          });
          if (written.count !== 1) throw Errors.conflict(`"${input.slug}" changed while this batch was being applied — preview the file again`);
          versions.push({ id: uuidv7(), productId: prev.id, version, content: content as unknown as Prisma.InputJsonValue, status: rowStatus, actorId: actor.id, reason });
          audits.push({ actorType: actor.type, actorId: actor.id, action: "activity.update", entityType: "product", entityId: prev.id, before: { version: prev.version, title: prev.title, status: prev.status } as Prisma.InputJsonValue, after: { version, title: content.title, status: rowStatus, source: "import" } as Prisma.InputJsonValue, reason, ipHash: actor.ipHash, userAgent: actor.userAgent });
          if (supplierId) mappings.push({ productId: prev.id, supplierId });
          items.push({ slug: input.slug, action: "update", before: prev.version, after: version, id: prev.id });
        } else {
          const id = uuidv7();
          const content = buildActivityContent({ ...input, fulfilmentMode: "inquiry" }, { id, rating: 0, reviewCount: 0, bookedThisMonth: 0 });
          const rowStatus = publishRow ? "published" : "draft";
          creates.push({ id, slug: content.slug, ...projectActivity(content), content: content as unknown as Prisma.InputJsonValue, status: rowStatus, version: 1, fulfilmentMode: "inquiry", publishedAt: rowStatus === "published" ? now : null });
          versions.push({ id: uuidv7(), productId: id, version: 1, content: content as unknown as Prisma.InputJsonValue, status: rowStatus, actorId: actor.id, reason });
          audits.push({ actorType: actor.type, actorId: actor.id, action: "activity.create", entityType: "product", entityId: id, after: { slug: content.slug, title: content.title, status: rowStatus, source: "import" } as Prisma.InputJsonValue, reason, ipHash: actor.ipHash, userAgent: actor.userAgent });
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
      await tx.importBatch.update({ where: { id: batchId }, data: { rowsOk: items.length, rowsFailed: preview.length - items.length } });
      audits.push({ actorType: actor.type, actorId: actor.id, action: "import.apply", entityType: "import_batch", entityId: batchId, after: { applied: items.length, created: creates.length, updated: items.length - creates.length, publish: Boolean(opts.publish), heldForReview: heldSlugs, categoriesCreated: missing } as Prisma.InputJsonValue, reason, ipHash: actor.ipHash, userAgent: actor.userAgent });
      await tx.auditLog.createMany({ data: audits });
      return { items, categoriesCreated: missing, heldForReview: heldSlugs };
    }, IMPORT_TX).catch(async (error) => {
      // Only a batch still "previewed" (this transaction rolled back) becomes failed — never one another call applied.
      await prisma.importBatch.updateMany({ where: { id: batchId, status: "previewed" }, data: { status: "failed", errors: [{ row: 0, field: "_", message: error instanceof Error ? error.message : "apply failed" }] as unknown as Prisma.InputJsonValue } }).catch(() => {});
      log.error("import.apply_failed", { batchId, error });
      throw error;
    });
    revalidateCatalog();
    const created = result.items.filter((i) => i.action === "create").length;
    return { batchId, applied: result.items.length, created, updated: result.items.length - created, published: opts.publish ? result.items.length - result.heldForReview.length : 0, heldForReview: result.heldForReview, categoriesCreated: result.categoriesCreated, items: result.items };
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

  /**
   * Every non-deleted activity as an import-compatible CSV — the template and
   * the round-trip format. `blank: true` is the header row alone. A listing
   * whose stored document no longer validates cannot be written as a row;
   * it is counted in `skipped` (and logged) instead of vanishing silently.
   */
  async exportCsv(actor: Actor, opts: { blank?: boolean } = {}): Promise<{ csv: string; rows: number; skipped: string[] }> {
    requirePermission(actor, "products.edit");
    if (opts.blank) return { csv: toCsv([]), rows: 0, skipped: [] };
    const rows = await prisma.product.findMany({ where: { deletedAt: null }, select: { content: true, slug: true }, orderBy: { slug: "asc" } });
    const items: ActivityInput[] = [];
    const skipped: string[] = [];
    for (const r of rows) {
      const input = storedInput(r.content);
      if (input) items.push(input);
      else skipped.push(r.slug);
    }
    if (skipped.length) log.warn("import.export_skipped_invalid", { count: skipped.length, slugs: skipped.slice(0, 20) });
    return { csv: toCsv(items), rows: items.length, skipped };
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

import "server-only";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma, TX_OPTIONS, type Tx } from "../lib/db";
import type { Actor } from "../lib/actor";
import { requirePermission } from "../lib/actor";
import { audit } from "../lib/audit";
import { Errors } from "../lib/errors";
import { uuidv7 } from "../lib/ids";
import { revalidateCatalog } from "../lib/catalog-cache";
import {
  activitySchema,
  buildActivityContent,
  categoryInputSchema,
  projectActivity,
  toActivity,
  toCategory,
  type ActivityInput,
} from "../schemas/activity.schema";
import type { Activity, Category } from "@/lib/types";

/**
 * Activity management — the admin write model for `products.content`.
 *
 * Rules:
 *  - Every write is one transaction: product row + `product_versions` row +
 *    audit row commit together or not at all.
 *  - `products.fulfilment_mode` stays THE HINGE (§17 §6.4): it is owned by
 *    `catalogService.setFulfilmentMode` and mirrored into the document on
 *    every read/write; an edit form cannot flip it.
 *  - Optimistic concurrency: callers pass `expectedVersion`; a stale write is
 *    a 409, never a silent overwrite.
 *  - Delete is soft (`deleted_at`) and the row is archived; slugs stay
 *    reserved so a deleted URL cannot be hijacked by a new listing.
 */

export type ActivityStatus = "draft" | "published" | "archived";
export const ACTIVITY_STATUSES: ActivityStatus[] = ["draft", "published", "archived"];

export interface ActivityListFilters {
  q?: string;
  status?: ActivityStatus | "deleted";
  tier?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface ActivityAdminRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  tier: string;
  status: string;
  categorySlug: string;
  fulfilmentMode: "inquiry" | "instant";
  quoteOnly: boolean;
  priceFromInr: number | null;
  version: number;
  updatedAt: Date;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

/** Outcome of one bulk status change — every row is accounted for. */
export interface BulkStatusResult {
  /** Rows whose status actually moved. */
  changed: number;
  /** Rows already at the target status. */
  skipped: number;
  /** Rows left alone because their content document does not validate. */
  invalid: number;
  /** Rows matching the selection in total. */
  matched: number;
  /** `matched` beyond BULK_LIMIT — run the same action again to clear them. */
  remaining: number;
}

/** One click can never start an unbounded transaction. */
export const BULK_LIMIT = 500;
const BULK_TX = { maxWait: 15_000, timeout: 120_000 } as const;

export interface ActivityAdminDetail extends ActivityAdminRow {
  content: Activity;
  createdAt: Date;
  versions: { version: number; status: string; actorId: string | null; reason: string | null; createdAt: Date }[];
}

const SELECT_ROW = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  tier: true,
  status: true,
  categorySlug: true,
  fulfilmentMode: true,
  quoteOnly: true,
  priceFromInr: true,
  version: true,
  updatedAt: true,
  publishedAt: true,
  deletedAt: true,
} satisfies Prisma.ProductSelect;

type RowShape = Prisma.ProductGetPayload<{ select: typeof SELECT_ROW }>;

function toRow(r: RowShape): ActivityAdminRow {
  return { ...r, priceFromInr: r.priceFromInr == null ? null : Number(r.priceFromInr) / 100 };
}

/** Document as stored, with the hinge column overlaid so the two never disagree. */
function readContent(row: { content: unknown; fulfilmentMode: "inquiry" | "instant"; id: string; slug: string; title: string }): Activity {
  const parsed = activitySchema.safeParse(row.content);
  if (!parsed.success) {
    // Row predates the content migration (seed not yet run) — expose a stub so the
    // admin can see and fix it rather than a 500.
    throw Errors.conflict(`Activity "${row.slug}" has no valid content document yet — run the seed or edit it from the console`, { id: row.id });
  }
  return { ...(parsed.data as Activity), fulfilmentMode: row.fulfilmentMode };
}

async function writeVersion(tx: Tx, productId: string, version: number, content: Activity, status: string, actor: Actor, reason?: string) {
  await tx.productVersion.create({
    data: { id: uuidv7(), productId, version, content: content as unknown as Prisma.InputJsonValue, status, actorId: actor.id, reason },
  });
}

/** Keep the supplier + mapping graph in step with the document's supplier block. */
async function ensureSupplierMapping(tx: Tx, productId: string, supplier: Activity["supplier"]) {
  const code = supplier.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || supplier.id;
  const row = await tx.supplier.upsert({
    where: { code },
    create: {
      id: uuidv7(),
      code,
      name: supplier.name,
      source: supplier.source === "direct" ? "direct" : supplier.source === "portal" ? "portal" : "api",
      adapter: "manual",
      capabilities: { availability: false, booking: false, cancellation: false, lookup: false },
      reliabilityScore: supplier.reliability,
    },
    update: { name: supplier.name, reliabilityScore: supplier.reliability },
  });
  const exists = await tx.productSupplierMapping.findFirst({ where: { productId, supplierId: row.id, variantCode: null }, select: { id: true } });
  if (!exists) await tx.productSupplierMapping.create({ data: { id: uuidv7(), productId, supplierId: row.id, priority: 1, externalRef: {} } });
}

async function assertCategoryExists(tx: Tx, slug: string) {
  const c = await tx.category.findUnique({ where: { slug }, select: { deletedAt: true } });
  if (!c || c.deletedAt) throw Errors.validation({ categorySlug: `Unknown category "${slug}"` });
}

/** The console's filter set, as a Prisma `where`. Shared by `list` and `bulkSetStatus` so "select all matching" means exactly what the table shows. */
function activityWhere(filters: ActivityListFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (filters.status === "deleted") where.deletedAt = { not: null };
  else {
    where.deletedAt = null;
    if (filters.status) where.status = filters.status;
  }
  if (filters.tier) where.tier = filters.tier;
  if (filters.category) where.categorySlug = filters.category;
  if (filters.q?.trim()) {
    const q = filters.q.trim().slice(0, 80);
    where.OR = [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }, { location: { contains: q, mode: "insensitive" } }];
  }
  return where;
}

function nextCopySlug(base: string, taken: Set<string>): string {
  const root = base.replace(/-copy(-\d+)?$/, "");
  for (let n = 1; n < 1000; n++) {
    const s = n === 1 ? `${root}-copy` : `${root}-copy-${n}`;
    if (!taken.has(s)) return s;
  }
  throw Errors.conflict("Too many copies of this activity");
}

export const activityService = {
  /* ------------------------------------------------------------- reads */

  async list(actor: Actor, filters: ActivityListFilters = {}): Promise<{ rows: ActivityAdminRow[]; total: number; page: number; pageSize: number }> {
    requirePermission(actor, "products.edit");
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 25));
    const where = activityWhere(filters);
    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, select: SELECT_ROW, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.product.count({ where }),
    ]);
    return { rows: rows.map(toRow), total, page, pageSize };
  },

  async get(actor: Actor, id: string): Promise<ActivityAdminDetail> {
    requirePermission(actor, "products.edit");
    const row = await prisma.product.findUnique({
      where: { id },
      select: { ...SELECT_ROW, content: true, createdAt: true, versions: { select: { version: true, status: true, actorId: true, reason: true, createdAt: true }, orderBy: { version: "desc" }, take: 50 } },
    });
    if (!row) throw Errors.notFound("Activity");
    const { versions, content, createdAt, ...rest } = row;
    return { ...toRow(rest), createdAt, versions, content: readContent({ ...rest, content }) };
  },

  async getBySlug(actor: Actor, slug: string): Promise<ActivityAdminDetail | null> {
    requirePermission(actor, "products.edit");
    const row = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    return row ? activityService.get(actor, row.id) : null;
  },

  async listVersions(actor: Actor, id: string) {
    requirePermission(actor, "products.edit");
    const rows = await prisma.productVersion.findMany({ where: { productId: id }, orderBy: { version: "desc" }, take: 200 });
    if (rows.length === 0) {
      const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw Errors.notFound("Activity");
    }
    return rows.map((v) => ({ version: v.version, status: v.status, actorId: v.actorId, reason: v.reason, createdAt: v.createdAt, content: toActivity(v.content) }));
  },

  /* ------------------------------------------------------------ writes */

  async create(actor: Actor, input: ActivityInput, opts: { status?: "draft" | "published"; reason?: string; tx?: Tx } = {}) {
    requirePermission(actor, "products.edit");
    const status = opts.status ?? "draft";
    if (status === "published") requirePermission(actor, "products.publish");

    const run = async (tx: Tx) => {
      const clash = await tx.product.findUnique({ where: { slug: input.slug }, select: { id: true, deletedAt: true } });
      if (clash) throw Errors.conflict(`Slug "${input.slug}" is already in use${clash.deletedAt ? " by a deleted activity (restore it instead)" : ""}`, { slug: input.slug });
      await assertCategoryExists(tx, input.categorySlug);

      const id = uuidv7();
      // Instant needs an API supplier mapping — a new listing can never start instant.
      const content = buildActivityContent({ ...input, fulfilmentMode: "inquiry" }, { id, rating: 0, reviewCount: 0, bookedThisMonth: 0 });
      const row = await tx.product.create({
        data: {
          id,
          slug: content.slug,
          ...projectActivity(content),
          content: content as unknown as Prisma.InputJsonValue,
          status,
          version: 1,
          fulfilmentMode: "inquiry",
          publishedAt: status === "published" ? new Date() : null,
        },
        select: SELECT_ROW,
      });
      await ensureSupplierMapping(tx, id, content.supplier);
      await writeVersion(tx, id, 1, content, status, actor, opts.reason);
      await audit(actor, "activity.create", { type: "product", id }, { after: { slug: content.slug, title: content.title, status }, reason: opts.reason }, tx);
      return toRow(row);
    };

    const row = opts.tx ? await run(opts.tx) : await prisma.$transaction(run, TX_OPTIONS);
    if (!opts.tx) revalidateCatalog();
    return row;
  },

  async update(actor: Actor, id: string, input: ActivityInput, opts: { reason?: string; expectedVersion?: number; tx?: Tx } = {}) {
    requirePermission(actor, "products.edit");

    const run = async (tx: Tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before || before.deletedAt) throw Errors.notFound("Activity");
      if (opts.expectedVersion !== undefined && before.version !== opts.expectedVersion) {
        throw Errors.conflict("This activity was changed by someone else while you were editing — reload and try again", { version: before.version, expectedVersion: opts.expectedVersion });
      }
      if (input.slug !== before.slug) {
        const clash = await tx.product.findUnique({ where: { slug: input.slug }, select: { id: true } });
        if (clash) throw Errors.conflict(`Slug "${input.slug}" is already in use`, { slug: input.slug });
      }
      await assertCategoryExists(tx, input.categorySlug);

      const prev = activitySchema.safeParse(before.content);
      const derived = prev.success
        ? { id: prev.data.id, rating: prev.data.rating, reviewCount: prev.data.reviewCount, bookedThisMonth: prev.data.bookedThisMonth }
        : { id, rating: Number(before.rating ?? 0), reviewCount: before.reviewCount ?? 0, bookedThisMonth: 0 };
      const content = buildActivityContent({ ...input, fulfilmentMode: before.fulfilmentMode }, derived);
      const version = before.version + 1;
      const row = await tx.product.update({
        where: { id },
        data: { slug: content.slug, ...projectActivity(content), content: content as unknown as Prisma.InputJsonValue, version },
        select: SELECT_ROW,
      });
      await ensureSupplierMapping(tx, id, content.supplier);
      await writeVersion(tx, id, version, content, before.status, actor, opts.reason);
      await audit(actor, "activity.update", { type: "product", id }, { before: { version: before.version, slug: before.slug, title: before.title }, after: { version, slug: content.slug, title: content.title }, reason: opts.reason }, tx);
      return toRow(row);
    };

    const row = opts.tx ? await run(opts.tx) : await prisma.$transaction(run, TX_OPTIONS);
    if (!opts.tx) revalidateCatalog();
    return row;
  },

  async duplicate(actor: Actor, id: string) {
    requirePermission(actor, "products.edit");
    const row = await prisma.$transaction(async (tx) => {
      const src = await tx.product.findUnique({ where: { id } });
      if (!src || src.deletedAt) throw Errors.notFound("Activity");
      const content = readContent(src);
      const taken = new Set((await tx.product.findMany({ where: { slug: { startsWith: src.slug.replace(/-copy(-\d+)?$/, "") } }, select: { slug: true } })).map((p) => p.slug));
      const slug = nextCopySlug(src.slug, taken);
      const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...input } = content;
      const created = await activityService.create(actor, { ...input, slug, title: `${content.title} (copy)`, badges: {} }, { status: "draft", reason: `Duplicated from ${src.slug}`, tx });
      await audit(actor, "activity.duplicate", { type: "product", id: created.id }, { before: { source: src.id, slug: src.slug }, after: { slug } }, tx);
      return created;
    }, TX_OPTIONS);
    revalidateCatalog();
    return row;
  },

  /** publish / unpublish (→ draft) / archive. */
  async setStatus(actor: Actor, id: string, status: ActivityStatus, reason?: string) {
    requirePermission(actor, "products.publish");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before || before.deletedAt) throw Errors.notFound("Activity");
      if (before.status === status) return toRow(before);
      const content = readContent(before);
      const version = before.version + 1;
      const after = await tx.product.update({
        where: { id },
        data: { status, version, publishedAt: status === "published" ? (before.publishedAt ?? new Date()) : before.publishedAt },
        select: SELECT_ROW,
      });
      await writeVersion(tx, id, version, content, status, actor, reason ?? `status → ${status}`);
      await audit(actor, `activity.${status === "published" ? "publish" : status === "archived" ? "archive" : "unpublish"}`, { type: "product", id }, { before: { status: before.status }, after: { status }, reason }, tx);
      return toRow(after);
    }, TX_OPTIONS);
    revalidateCatalog();
    return row;
  },

  /**
   * Bulk publish / unpublish / archive.
   *
   * `setStatus` per row costs ~4 round trips; at 200 listings on a remote
   * Postgres that is minutes of waiting, which is why the console had no
   * "select all" before. This does the same work — status change, version
   * row, audit row — in a fixed number of queries: read, one UPDATE (plus one
   * more when publishing sets `published_at`), one `createMany` for versions,
   * one for the audit trail.
   *
   * `target.ids` acts on an explicit selection; `target.filters` acts on
   * everything matching the console's current filter, capped at BULK_LIMIT so
   * one click can never start an unbounded transaction — the result reports
   * how many are left so the caller can repeat.
   */
  async bulkSetStatus(
    actor: Actor,
    target: { ids?: string[]; filters?: ActivityListFilters },
    status: ActivityStatus,
    reason?: string,
  ): Promise<BulkStatusResult> {
    requirePermission(actor, "products.publish");
    const ids = [...new Set(target.ids ?? [])];
    if (!ids.length && !target.filters) throw Errors.validation({ ids: "Select at least one activity" });
    if (ids.length > BULK_LIMIT) throw Errors.validation({ ids: `Too many at once — ${BULK_LIMIT} is the limit` });

    const where: Prisma.ProductWhereInput = ids.length ? { id: { in: ids }, deletedAt: null } : { ...activityWhere(target.filters ?? {}), deletedAt: null };
    const now = new Date();
    const why = reason?.trim() || `bulk status → ${status}`;

    const result = await prisma.$transaction(async (tx) => {
      const matched = await tx.product.count({ where });
      const rows = await tx.product.findMany({ where, select: { ...SELECT_ROW, content: true }, orderBy: { updatedAt: "desc" }, take: BULK_LIMIT });
      const remaining = Math.max(0, matched - rows.length);
      const candidates = rows.filter((r) => r.status !== status);
      const skipped = rows.length - candidates.length;
      // A single unparseable document must not block the other 499 rows.
      const changing = candidates.flatMap((r) => {
        const parsed = activitySchema.safeParse(r.content);
        if (!parsed.success) return [];
        return [{ ...r, doc: { ...(parsed.data as Activity), fulfilmentMode: r.fulfilmentMode } }];
      });
      const invalid = candidates.length - changing.length;
      if (!changing.length) return { changed: 0, skipped, invalid, matched, remaining };

      const changingIds = changing.map((r) => r.id);
      await tx.product.updateMany({ where: { id: { in: changingIds } }, data: { status, version: { increment: 1 } } });
      if (status === "published") {
        await tx.product.updateMany({ where: { id: { in: changingIds }, publishedAt: null }, data: { publishedAt: now } });
      }
      await tx.productVersion.createMany({
        data: changing.map((r) => ({
          id: uuidv7(),
          productId: r.id,
          version: r.version + 1,
          content: r.doc as unknown as Prisma.InputJsonValue,
          status,
          actorId: actor.id,
          reason: why,
        })),
      });
      await tx.auditLog.createMany({
        data: changing.map((r) => ({
          actorType: actor.type,
          actorId: actor.id,
          action: `activity.${status === "published" ? "publish" : status === "archived" ? "archive" : "unpublish"}`,
          entityType: "product",
          entityId: r.id,
          before: { status: r.status, version: r.version } as Prisma.InputJsonValue,
          after: { status, version: r.version + 1, bulk: true } as Prisma.InputJsonValue,
          reason: why,
          ipHash: actor.ipHash,
          userAgent: actor.userAgent,
        })),
      });
      return { changed: changing.length, skipped, invalid, matched, remaining };
    }, BULK_TX);

    if (result.changed) revalidateCatalog();
    return result;
  },

  /** Soft delete. The slug stays reserved; `restore` undoes it. */
  async remove(actor: Actor, id: string, reason: string) {
    requirePermission(actor, "products.delete");
    if (!reason.trim()) throw Errors.validation({ reason: "A reason is required to delete an activity" });
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw Errors.notFound("Activity");
      if (before.deletedAt) return toRow(before);
      const inFlight = await tx.inquiryItem.count({ where: { productId: id, inquiry: { status: { in: ["new", "assigned", "contacted", "quoted", "negotiating", "payment_pending"] } } } });
      const content = readContent(before);
      const version = before.version + 1;
      const after = await tx.product.update({ where: { id }, data: { deletedAt: new Date(), status: "archived", version }, select: SELECT_ROW });
      await writeVersion(tx, id, version, content, "archived", actor, reason);
      await audit(actor, "activity.delete", { type: "product", id }, { before: { status: before.status, deletedAt: null }, after: { status: "archived", deletedAt: after.deletedAt, openInquiries: inFlight }, reason }, tx);
      return toRow(after);
    }, TX_OPTIONS);
    revalidateCatalog();
    return row;
  },

  async restore(actor: Actor, id: string) {
    requirePermission(actor, "products.delete");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw Errors.notFound("Activity");
      if (!before.deletedAt) return toRow(before);
      const content = readContent(before);
      const version = before.version + 1;
      const after = await tx.product.update({ where: { id }, data: { deletedAt: null, status: "draft", version }, select: SELECT_ROW });
      await writeVersion(tx, id, version, content, "draft", actor, "restored");
      await audit(actor, "activity.restore", { type: "product", id }, { before: { deletedAt: before.deletedAt }, after: { deletedAt: null, status: "draft" } }, tx);
      return toRow(after);
    }, TX_OPTIONS);
    revalidateCatalog();
    return row;
  },

  /** Roll content back to an earlier version by writing a NEW version equal to it. */
  async restoreVersion(actor: Actor, id: string, version: number, reason?: string) {
    requirePermission(actor, "products.edit");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before || before.deletedAt) throw Errors.notFound("Activity");
      const old = await tx.productVersion.findUnique({ where: { productId_version: { productId: id, version } } });
      if (!old) throw Errors.notFound(`Version ${version}`);
      const restored = { ...toActivity(old.content), fulfilmentMode: before.fulfilmentMode };
      if (restored.slug !== before.slug) {
        const clash = await tx.product.findUnique({ where: { slug: restored.slug }, select: { id: true } });
        if (clash && clash.id !== id) throw Errors.conflict(`Slug "${restored.slug}" from version ${version} is now used by another activity`);
      }
      const next = before.version + 1;
      const after = await tx.product.update({
        where: { id },
        data: { slug: restored.slug, ...projectActivity(restored), content: restored as unknown as Prisma.InputJsonValue, version: next },
        select: SELECT_ROW,
      });
      await writeVersion(tx, id, next, restored, before.status, actor, reason ?? `restored from v${version}`);
      await audit(actor, "activity.restore_version", { type: "product", id }, { before: { version: before.version }, after: { version: next, restoredFrom: version }, reason }, tx);
      return toRow(after);
    }, TX_OPTIONS);
    revalidateCatalog();
    return row;
  },

  /* -------------------------------------------------------- categories */

  async listCategories(actor: Actor, opts: { includeDeleted?: boolean } = {}) {
    requirePermission(actor, "products.edit");
    const rows = await prisma.category.findMany({ where: opts.includeDeleted ? {} : { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const counts = await prisma.product.groupBy({ by: ["categorySlug"], where: { deletedAt: null }, _count: { _all: true } });
    const countBy = new Map(counts.map((c) => [c.categorySlug, c._count._all]));
    return rows.map((r) => ({ ...r, category: toCategory(r) as Category, activityCount: countBy.get(r.slug) ?? 0 }));
  },

  async upsertCategory(actor: Actor, raw: z.input<typeof categoryInputSchema>, opts: { reason?: string } = {}) {
    requirePermission(actor, "categories.edit");
    const input = categoryInputSchema.parse(raw);
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { slug: input.slug } });
      const data = {
        name: input.name,
        shortName: input.shortName,
        emoji: input.emoji,
        tagline: input.tagline,
        intro: input.intro,
        heroImage: input.heroImage ?? `img:category:${input.slug}:0`,
        faqs: input.faqs as unknown as Prisma.InputJsonValue,
        relatedSlugs: input.relatedSlugs,
        featuredSlugs: input.featuredSlugs,
        sortOrder: input.sortOrder,
      };
      const after = before
        ? await tx.category.update({ where: { slug: input.slug }, data: { ...data, deletedAt: null } })
        : await tx.category.create({ data: { id: uuidv7(), slug: input.slug, ...data } });
      await audit(actor, before ? "category.update" : "category.create", { type: "category", id: after.id }, { before: before ?? undefined, after, reason: opts.reason }, tx);
      return after;
    }, TX_OPTIONS);
    revalidateCatalog();
    return row;
  },

  async setCategoryStatus(actor: Actor, id: string, status: ActivityStatus, reason?: string) {
    requirePermission(actor, "categories.edit");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before || before.deletedAt) throw Errors.notFound("Category");
      const after = await tx.category.update({ where: { id }, data: { status } });
      await audit(actor, "category.status", { type: "category", id }, { before: { status: before.status }, after: { status }, reason }, tx);
      return after;
    }, TX_OPTIONS);
    revalidateCatalog();
    return row;
  },

  /**
   * Publish / unpublish several categories at once. A published activity in a
   * draft category has no category page to sit on, so an import that creates
   * categories as drafts needs this to be one click, not fourteen.
   */
  async bulkSetCategoryStatus(actor: Actor, ids: string[], status: ActivityStatus, reason?: string): Promise<BulkStatusResult> {
    requirePermission(actor, "categories.edit");
    const unique = [...new Set(ids)];
    if (!unique.length) throw Errors.validation({ ids: "Select at least one category" });
    if (unique.length > BULK_LIMIT) throw Errors.validation({ ids: `Too many at once — ${BULK_LIMIT} is the limit` });
    const why = reason?.trim() || `bulk category status → ${status}`;

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.category.findMany({ where: { id: { in: unique }, deletedAt: null }, select: { id: true, status: true } });
      const changing = rows.filter((r) => r.status !== status);
      if (!changing.length) return { changed: 0, skipped: rows.length, invalid: 0, matched: rows.length, remaining: 0 };
      await tx.category.updateMany({ where: { id: { in: changing.map((r) => r.id) } }, data: { status } });
      await tx.auditLog.createMany({
        data: changing.map((r) => ({
          actorType: actor.type,
          actorId: actor.id,
          action: "category.status",
          entityType: "category",
          entityId: r.id,
          before: { status: r.status } as Prisma.InputJsonValue,
          after: { status, bulk: true } as Prisma.InputJsonValue,
          reason: why,
          ipHash: actor.ipHash,
          userAgent: actor.userAgent,
        })),
      });
      return { changed: changing.length, skipped: rows.length - changing.length, invalid: 0, matched: rows.length, remaining: 0 };
    }, TX_OPTIONS);

    if (result.changed) revalidateCatalog();
    return result;
  },

  async removeCategory(actor: Actor, id: string, reason: string) {
    requirePermission(actor, "categories.edit");
    if (!reason.trim()) throw Errors.validation({ reason: "A reason is required" });
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw Errors.notFound("Category");
      const inUse = await tx.product.count({ where: { categorySlug: before.slug, deletedAt: null } });
      if (inUse > 0) throw Errors.conflict(`${inUse} activities still use this category — move them first`, { inUse });
      const after = await tx.category.update({ where: { id }, data: { deletedAt: new Date(), status: "archived" } });
      await audit(actor, "category.delete", { type: "category", id }, { before: { status: before.status }, after: { status: "archived", deletedAt: after.deletedAt }, reason }, tx);
      return after;
    }, TX_OPTIONS);
    revalidateCatalog();
    return row;
  },
};

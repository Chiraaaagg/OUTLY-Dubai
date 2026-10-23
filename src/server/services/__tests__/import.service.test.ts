import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activities } from "@/lib/data/activities";
import type { Actor } from "../../lib/actor";
import { uuidv7 } from "../../lib/ids";
import { activityInputSchema } from "../../schemas/activity.schema";
import { toCsv } from "../../imports/parsers";

/** Import pipeline against the real dev database (rows prefixed zz-test-, purged in afterAll). */

const enabled = Boolean(process.env.DATABASE_URL);
const RUN = uuidv7().slice(-8);
const slug = (s: string) => `zz-test-${RUN}-${s}`;
const admin: Actor = { type: "admin", id: uuidv7(), roles: ["admin"], permissions: new Set(["*"]) };
/** Can run an import but may not publish — the permission split the apply path must honour. */
const contentOnly: Actor = { type: "admin", id: uuidv7(), roles: ["content"], permissions: new Set(["products.edit", "categories.edit", "imports.run"]) };
const agent: Actor = { type: "agent", id: uuidv7(), roles: ["agent"], permissions: new Set(["inquiries.view_all"]) };

function input(i: number, s: string) {
  const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest } = activities[i];
  return activityInputSchema.parse({ ...rest, slug: slug(s), relatedSlugs: [], comboSlugs: [] });
}

describe.skipIf(!enabled)("importService", () => {
  let prisma: typeof import("../../lib/db").prisma;
  let importService: typeof import("../import.service").importService;
  let activityService: typeof import("../activity.service").activityService;

  beforeAll(async () => {
    ({ prisma } = await import("../../lib/db"));
    ({ importService } = await import("../import.service"));
    ({ activityService } = await import("../activity.service"));
  });

  afterAll(async () => {
    await prisma.productSupplierMapping.deleteMany({ where: { product: { slug: { startsWith: `zz-test-${RUN}` } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: `zz-test-${RUN}` } } });
    await prisma.importBatch.deleteMany({ where: { createdBy: admin.id } });
    await prisma.$disconnect();
  });

  it("previews a CSV: validates rows, classifies create vs update, reports errors per row", async () => {
    const existing = await activityService.create(admin, input(0, "exists"));
    const rows = [input(0, "exists"), input(1, "new-one"), { ...input(2, "broken"), price: { adult: { inr: -5, aed: 1 } } }];
    const csv = toCsv(rows as never);
    const preview = await importService.preview(admin, { source: "csv", text: csv, fileName: "test.csv" });
    expect(preview.rowsTotal).toBe(3);
    expect(preview.rowsOk).toBe(2);
    expect(preview.rowsFailed).toBe(1);
    expect(preview.rows[0]).toMatchObject({ action: "update", ok: true, slug: existing.slug });
    expect(preview.rows[1]).toMatchObject({ action: "create", ok: true });
    expect(preview.rows[2].ok).toBe(false);
    expect(preview.rows[2].errors[0].field).toContain("price");
    expect(await prisma.product.count({ where: { slug: slug("new-one") } })).toBe(0); // preview writes nothing
  });

  it("refuses to apply a batch with errors unless partial, then applies atomically and is revertible", async () => {
    const before = await activityService.create(admin, input(3, "upd"), { status: "published" });
    const rows = [{ ...input(3, "upd"), title: "Imported title" }, input(4, "created"), { ...input(5, "bad"), tier: "Z" }];
    const preview = await importService.preview(admin, { source: "bulk", items: rows });
    expect(preview.rowsFailed).toBe(1);
    await expect(importService.apply(admin, preview.batchId)).rejects.toMatchObject({ code: "CONFLICT" });

    const result = await importService.apply(admin, preview.batchId, { partial: true });
    expect(result).toMatchObject({ applied: 2, created: 1, updated: 1 });
    const updated = await activityService.get(admin, before.id);
    expect(updated.content.title).toBe("Imported title");
    expect(updated.version).toBe(2);
    expect(updated.status).toBe("published");
    const created = await activityService.getBySlug(admin, slug("created"));
    expect(created?.status).toBe("draft");

    await expect(importService.apply(admin, preview.batchId, { partial: true })).rejects.toMatchObject({ code: "CONFLICT" });

    const reverted = await importService.revert(admin, preview.batchId);
    expect(reverted.reverted).toBe(2);
    const after = await activityService.get(admin, before.id);
    expect(after.content.title).toBe(activities[3].title);
    expect(after.version).toBe(3);
    const gone = await activityService.getBySlug(admin, slug("created"));
    expect(gone?.deletedAt).not.toBeNull();
    const batch = await importService.get(admin, preview.batchId);
    expect(batch.status).toBe("reverted");
    expect(batch.items).toHaveLength(2);
  }, 120_000);

  it("publish applies to updated rows as well as created ones", async () => {
    // A draft that already exists — re-importing over it is how a catalogue
    // normally goes live, and "publish" used to skip exactly these rows.
    const existing = await activityService.create(admin, input(6, "pub-upd"));
    expect(existing.status).toBe("draft");

    const preview = await importService.preview(admin, { source: "bulk", items: [{ ...input(6, "pub-upd"), title: "Now live" }, input(7, "pub-new")] });
    const result = await importService.apply(admin, preview.batchId, { publish: true });
    expect(result).toMatchObject({ applied: 2, created: 1, updated: 1, published: 2 });

    const updated = await activityService.get(admin, existing.id);
    expect(updated.status).toBe("published");
    expect(updated.publishedAt).not.toBeNull();
    expect(updated.content.title).toBe("Now live");
    const created = await activityService.getBySlug(admin, slug("pub-new"));
    expect(created?.status).toBe("published");

    // The version row records the status it was written at, so history reads true.
    expect(await prisma.productVersion.count({ where: { productId: existing.id, version: updated.version, status: "published" } })).toBe(1);

    // Publishing through an import still needs products.publish.
    const p2 = await importService.preview(admin, { source: "bulk", items: [input(6, "pub-upd")] });
    await expect(importService.apply(contentOnly, p2.batchId, { publish: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("all-or-nothing: a row failing inside apply rolls the whole batch back", async () => {
    const rows = [input(6, "atomic-a"), input(7, "atomic-b")];
    const preview = await importService.preview(admin, { source: "bulk", items: rows });
    expect(preview.rowsOk).toBe(2);
    // Create the second slug behind the preview's back so apply hits a conflict on row 2.
    await activityService.create(admin, input(7, "atomic-b"));
    await prisma.product.update({ where: { slug: slug("atomic-b") }, data: { deletedAt: new Date(), status: "archived" } });
    await expect(importService.apply(admin, preview.batchId)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.product.count({ where: { slug: slug("atomic-a") } })).toBe(0);
    const batch = await importService.get(admin, preview.batchId);
    expect(batch.status).toBe("failed");
  }, 90_000);

  it("creates missing categories as drafts on request, otherwise reports them", async () => {
    const rows = [{ ...input(8, "newcat"), title: "Zzz Placeholder Listing", categorySlug: slug("cat-events") }];
    const preview = await importService.preview(admin, { source: "bulk", items: rows });
    expect(preview.rowsOk).toBe(0);
    expect(preview.missingCategories).toEqual([slug("cat-events")]);
    expect(preview.rows[0].missingCategory).toBe(slug("cat-events"));
    await expect(importService.apply(admin, preview.batchId, { partial: true })).rejects.toMatchObject({ code: "CONFLICT" });
    const again = await importService.preview(admin, { source: "bulk", items: rows });
    const result = await importService.apply(admin, again.batchId, { createMissingCategories: true });
    expect(result.created).toBe(1);
    expect(result.categoriesCreated).toEqual([slug("cat-events")]);
    const cat = await prisma.category.findUnique({ where: { slug: slug("cat-events") } });
    expect(cat?.status).toBe("draft");
    await prisma.productSupplierMapping.deleteMany({ where: { product: { slug: slug("newcat") } } });
    await prisma.product.deleteMany({ where: { slug: slug("newcat") } });
    await prisma.category.deleteMany({ where: { slug: slug("cat-events") } });
  }, 120_000);

  it("parses a pasted Google Doc into a single-row preview", async () => {
    const doc = `Title: ${slug("doc")}
Subtitle: A test listing from a doc
Category: Desert Safari
Tier: B
Price: 2990
Price AED: 129
Duration: 3h
Location: Al Awir
Meeting point: Hotel lobby
Inclusions
- Pickup
- Dinner
Cancellation policy
Free until 24h before.
`;
    const preview = await importService.preview(admin, { source: "doc", text: doc });
    expect(preview.rowsTotal).toBe(1);
    expect(preview.rows[0].ok, JSON.stringify(preview.rows[0].errors)).toBe(true);
    expect(preview.rows[0].action).toBe("create");
    expect(preview.rows[0].input?.categorySlug).toBe("desert-safari");
  });

  it("a sheet with a few columns updates only those fields of an existing listing", async () => {
    const before = await activityService.get(admin, (await activityService.create(admin, input(9, "partial"), { status: "published" })).id);
    const csv = `slug,Selling Price (AED),Price (INR),Tier,Duration (hours),Meeting Point / Pickup,meetingPoint\n${before.slug},AED 199,"Rs. 4,500/-",,,,\n`;
    const preview = await importService.preview(admin, { source: "csv", text: csv, fileName: "partial.csv" });
    expect(preview.rows[0], JSON.stringify(preview.rows[0].errors)).toMatchObject({ action: "update", ok: true });
    await importService.apply(admin, preview.batchId);
    const after = await activityService.get(admin, before.id);
    // Only the two prices moved; the blank tier/duration/meeting point cells kept the listing's values.
    expect(after.content).toEqual({ ...before.content, price: { ...before.content.price, adult: { inr: 4500, aed: 199 } } });
    expect(after.status).toBe("published");
    expect(Number(after.priceFromInr)).toBe(4500);
  }, 90_000);

  it("the catalogue export re-imports as updates that change nothing", async () => {
    // attraction + collections are exactly the fields the old template dropped.
    const a = await activityService.get(admin, (await activityService.create(admin, { ...input(10, "rt-a"), attractionSlug: "burj-khalifa", collectionSlugs: ["first-time-dubai"], video: "https://example.com/v.mp4" })).id);
    const b = await activityService.get(admin, (await activityService.create(admin, { ...input(11, "rt-b"), faqs: [{ q: "Pipe | inside?", a: "Yes :: and\na new line" }] })).id);
    const { csv, skipped } = await importService.exportCsv(admin);
    expect(skipped).toEqual([]);
    const [head, ...lines] = csv.trimEnd().split("\r\n");
    const mine = lines.filter((l) => l.startsWith(`zz-test-${RUN}-rt-`));
    expect(mine).toHaveLength(2);
    const preview = await importService.preview(admin, { source: "csv", text: [head, ...mine].join("\r\n"), fileName: "export.csv" });
    expect(preview.rowsFailed, JSON.stringify(preview.rows.map((r) => r.errors))).toBe(0);
    expect(preview.rows.every((r) => r.action === "update" && !r.review)).toBe(true);
    await importService.apply(admin, preview.batchId);
    for (const before of [a, b]) {
      const after = await activityService.get(admin, before.id);
      expect(after.version).toBe(before.version + 1);
      expect(after.content).toEqual(before.content);
    }
  }, 120_000);

  it("the blank template is the header row; one filled row creates a listing with nothing invented", async () => {
    const { csv } = await importService.exportCsv(admin, { blank: true });
    await expect(importService.preview(admin, { source: "csv", text: csv })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const header = csv.trimEnd();
    const cols = header.split(",");
    const cell = (f: string, v: string) => (cols.indexOf(f) >= 0 ? v : "");
    const values: Record<string, string> = { slug: slug("tpl"), title: "Template Row Tour", subtitle: "A filled template row", tier: "C", categorySlug: "dubai-city-tours", location: "Deira", meetingPoint: "Gold Souk gate", durationMinutes: "150", "price.adult.inr": "2100", "price.adult.aed": "92", cancellationPolicy: "Free cancellation up to 48 hours before" };
    const row = cols.map((f) => cell(f, values[f] ?? "")).join(",");
    const preview = await importService.preview(admin, { source: "csv", text: `${header}\r\n${row}\r\n` });
    expect(preview.rows[0], JSON.stringify(preview.rows[0].errors)).toMatchObject({ ok: true, action: "create" });
    const derived = preview.rows[0].warnings.map((w) => w.field);
    for (const f of ["tier", "durationMinutes", "meetingPoint", "cancellationPolicy", "subtitle"]) expect(derived).not.toContain(f);
    expect(preview.rows[0].input).toMatchObject({ tier: "C", durationMinutes: 150, meetingPoint: "Gold Souk gate", freeCancellationHours: 48 });
  }, 90_000);

  it("publish immediately leaves rows with derived values to check as drafts", async () => {
    const csv = `title,tier,categorySlug,location,price.adult.inr,price.adult.aed,freeCancellationHours,inclusions,meetingPoint,slug\nReview Me Tour,B,desert-safari,Al Awir,2990,129,24,Dunes,,${slug("held")}\nReady Tour,B,desert-safari,Al Awir,2990,129,24,Dunes,Camp gate 2,${slug("ready")}\n`;
    const preview = await importService.preview(admin, { source: "csv", text: csv });
    expect(preview.rows.map((r) => [r.ok, Boolean(r.review)])).toEqual([
      [true, true],
      [true, true], // no images column: placeholder image is a review item too
    ]);
    const result = await importService.apply(admin, preview.batchId, { publish: true });
    expect(result.heldForReview.sort()).toEqual([slug("held"), slug("ready")].sort());
    expect(result.published).toBe(0);
    expect((await activityService.getBySlug(admin, slug("held")))?.status).toBe("draft");
  }, 90_000);

  it("refuses to apply an update when the listing changed after the preview", async () => {
    const before = await activityService.create(admin, input(12, "race"));
    const preview = await importService.preview(admin, { source: "csv", text: `slug,title\n${before.slug},From the sheet\n` });
    expect(preview.rows[0]).toMatchObject({ ok: true, action: "update" });
    await activityService.update(admin, before.id, { ...input(12, "race"), title: "Edited in the console" }, { expectedVersion: before.version });
    await expect(importService.apply(admin, preview.batchId)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await activityService.get(admin, before.id)).content.title).toBe("Edited in the console");
  }, 90_000);

  it("rejects non-Google URLs and agents", async () => {
    await expect(importService.fetch(admin, "https://evil.example.com/spreadsheets/d/abc123456789/edit")).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(importService.fetch(admin, "http://docs.google.com/spreadsheets/d/abc123456789/edit")).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(importService.preview(agent, { source: "bulk", items: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exports the catalogue as a CSV that previews with zero errors", async () => {
    const { csv } = await importService.exportCsv(admin);
    const preview = await importService.preview(admin, { source: "csv", text: csv, fileName: "export.csv" });
    expect(preview.rowsTotal).toBeGreaterThanOrEqual(1);
    expect(preview.rowsFailed).toBe(0);
    expect(preview.rows.every((r) => r.action === "update")).toBe(true);
  });
});

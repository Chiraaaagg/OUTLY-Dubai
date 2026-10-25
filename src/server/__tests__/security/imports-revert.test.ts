import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activities } from "@/lib/data/activities";
import type { Actor } from "../../lib/actor";
import { ROLE_PERMISSIONS, type RoleCode } from "../../lib/permissions";
import { activityInputSchema } from "../../schemas/activity.schema";
import { apiRequest, assertDisposableDb, cleanupPeople, dbEnabled, params, runId, createStaff, type StaffFixture } from "../helpers/fixtures";

/**
 * F02 / H02 / H15 — import rollback authorises the operations it performs and
 * never overwrites later edits.
 *
 * Runs against the disposable local Postgres only (assertDisposableDb), through
 * the real route handlers with real staff sessions where the HTTP boundary
 * matters, and through the service where a deterministic interleaving is
 * needed. Every product slug carries `zz-sec-<run>-`; products, batches, staff
 * and rate-limit buckets are removed in afterAll (audit rows are append-only
 * by design and stay).
 */

const RUN = runId();
const slug = (s: string) => `zz-sec-${RUN}-${s}`;

function input(i: number, s: string, patch: Record<string, unknown> = {}) {
  const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest } = activities[i % activities.length];
  return activityInputSchema.parse({ ...rest, slug: slug(s), relatedSlugs: [], comboSlugs: [], ...patch });
}

function actorOf(staff: StaffFixture, role: RoleCode): Actor {
  return { type: "admin", id: staff.id, roles: [role], permissions: new Set(ROLE_PERMISSIONS[role]) };
}

describe.skipIf(!dbEnabled)("import rollback authorisation and version preconditions", () => {
  let prisma: typeof import("../../lib/db").prisma;
  let importService: typeof import("../../services/import.service").importService;
  let activityService: typeof import("../../services/activity.service").activityService;
  let revertPOST: typeof import("@/app/api/admin/imports/[id]/revert/route").POST;
  let activityDELETE: typeof import("@/app/api/admin/activities/[id]/route").DELETE;
  let activityPATCH: typeof import("@/app/api/admin/activities/[id]/route").PATCH;
  let previewPOST: typeof import("@/app/api/admin/imports/preview/route").POST;
  let applyPOST: typeof import("@/app/api/admin/imports/[id]/apply/route").POST;

  const staff = {} as Record<"admin" | "admin2" | "ops" | "content" | "readonly", StaffFixture>;
  let admin: Actor;
  let admin2: Actor;
  let content: Actor;

  beforeAll(async () => {
    assertDisposableDb();
    ({ prisma } = await import("../../lib/db"));
    ({ importService } = await import("../../services/import.service"));
    ({ activityService } = await import("../../services/activity.service"));
    ({ POST: revertPOST } = await import("@/app/api/admin/imports/[id]/revert/route"));
    ({ DELETE: activityDELETE, PATCH: activityPATCH } = await import("@/app/api/admin/activities/[id]/route"));
    ({ POST: previewPOST } = await import("@/app/api/admin/imports/preview/route"));
    ({ POST: applyPOST } = await import("@/app/api/admin/imports/[id]/apply/route"));
    staff.admin = await createStaff(RUN, "admin", ["admin"]);
    staff.admin2 = await createStaff(RUN, "admin2", ["admin"]);
    staff.ops = await createStaff(RUN, "ops", ["ops"]);
    staff.content = await createStaff(RUN, "content", ["content"]);
    staff.readonly = await createStaff(RUN, "readonly", ["readonly"]);
    admin = actorOf(staff.admin, "admin");
    admin2 = actorOf(staff.admin2, "admin");
    content = actorOf(staff.content, "content");
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = Object.values(staff).map((s) => s.id);
    await prisma.importBatch.deleteMany({ where: { createdBy: { in: ids } } });
    await prisma.productSupplierMapping.deleteMany({ where: { product: { slug: { startsWith: `zz-sec-${RUN}-` } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: `zz-sec-${RUN}-` } } });
    await prisma.rateLimitBucket.deleteMany({ where: { OR: ids.map((id) => ({ key: { contains: id } })) } });
    await cleanupPeople(RUN);
    await prisma.$disconnect();
  });

  /** An applied batch created by `creator`: `creates` are new listings, `updates` change listings that exist first. */
  async function appliedBatch(creator: Actor, opts: { creates?: string[]; updates?: string[] }) {
    let n = 0;
    const items: unknown[] = [];
    const updatedIds: string[] = [];
    for (const s of opts.updates ?? []) {
      const row = await activityService.create(admin, input(n, s));
      updatedIds.push(row.id);
      items.push(input(n++, s, { title: `Imported ${s}` }));
    }
    for (const s of opts.creates ?? []) items.push(input(n++, s));
    const preview = await importService.preview(creator, { source: "bulk", items });
    expect(preview.rowsFailed, JSON.stringify(preview.rows.map((r) => r.errors))).toBe(0);
    const applied = await importService.apply(creator, preview.batchId);
    return { batchId: preview.batchId, items: applied.items, updatedIds };
  }

  /** Everything a rollback could touch: product rows, version history, batch state, audit trail. */
  async function snapshot(batchId: string) {
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: { orderBy: { slug: "asc" } } } });
    const ids = batch.items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, version: true, status: true, deletedAt: true, title: true, content: true }, orderBy: { id: "asc" } });
    const versions = await prisma.productVersion.findMany({ where: { productId: { in: ids } }, select: { productId: true, version: true }, orderBy: [{ productId: "asc" }, { version: "asc" }] });
    const audits = await prisma.auditLog.count({ where: { entityId: { in: [batchId, ...ids] } } });
    return { status: batch.status, revertedAt: batch.revertedAt, items: batch.items.length, products, versions, audits };
  }

  async function revertVia(who: StaffFixture, batchId: string, reason = "Synthetic rollback regression") {
    const res = await revertPOST(apiRequest(`/api/admin/imports/${batchId}/revert`, { body: { reason }, cookie: who.cookie }), params({ id: batchId }));
    return { status: res.status, body: (await res.json()) as { error?: { code: string; message: string; details?: Record<string, unknown> }; reverted?: number } };
  }

  /* ------------------------------------------------------- authorisation */

  it("content (imports.run, no products.delete) cannot roll back a batch that created a listing — 403, nothing written", async () => {
    const { batchId } = await appliedBatch(admin, { creates: ["c-create"] });
    const before = await snapshot(batchId);
    const res = await revertVia(staff.content, batchId);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: "FORBIDDEN", details: { permission: "products.delete" } });
    expect(await snapshot(batchId)).toEqual(before);
    // The listing is still live in the catalogue, not soft-deleted.
    expect(before.products[0].deletedAt).toBeNull();
  }, 90_000);

  it("readonly is refused at the route (no imports.run) and nothing is written", async () => {
    const { batchId } = await appliedBatch(admin, { creates: ["ro-create"] });
    const before = await snapshot(batchId);
    const res = await revertVia(staff.readonly, batchId);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
    expect(await snapshot(batchId)).toEqual(before);
  }, 90_000);

  it("admin rolls back a batch another admin created (permission-based, not creator-bound)", async () => {
    const { batchId, items, updatedIds } = await appliedBatch(admin2, { creates: ["a-create"], updates: ["a-update"] });
    const res = await revertVia(staff.admin, batchId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.reverted).toBe(2);
    const created = await prisma.product.findUniqueOrThrow({ where: { id: items.find((i) => i.action === "create")!.id } });
    expect(created.deletedAt).not.toBeNull();
    expect(created.status).toBe("archived");
    const restored = await activityService.get(admin, updatedIds[0]);
    expect(restored.content.title).toBe(activities[0].title);
    expect(restored.version).toBe(3);
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe("reverted");
    const audit = await prisma.auditLog.findMany({ where: { entityId: batchId, action: "import.revert" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorId).toBe(staff.admin.id);
  }, 90_000);

  it("ops rolls back a mixed batch", async () => {
    const { batchId } = await appliedBatch(admin, { creates: ["o-create"], updates: ["o-update"] });
    const res = await revertVia(staff.ops, batchId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.reverted).toBe(2);
  }, 90_000);

  it("content may roll back an update-only batch (holds products.edit)", async () => {
    const { batchId, updatedIds } = await appliedBatch(content, { updates: ["u-only"] });
    const res = await revertVia(staff.content, batchId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const restored = await activityService.get(admin, updatedIds[0]);
    expect(restored.content.title).toBe(activities[0].title);
  }, 90_000);

  it("a mixed batch is refused for content before ANY write — the update row is not restored either", async () => {
    const { batchId } = await appliedBatch(admin, { updates: ["m-update"], creates: ["m-create"] });
    const before = await snapshot(batchId);
    await expect(importService.revert(content, batchId)).rejects.toMatchObject({ code: "FORBIDDEN", details: { permission: "products.delete" } });
    expect(await snapshot(batchId)).toEqual(before);
  }, 90_000);

  /* ------------------------------------------------- version preconditions */

  it("a listing edited after the import makes rollback a 409 naming it; nothing is written", async () => {
    const { batchId, items, updatedIds } = await appliedBatch(admin, { creates: ["v-create"], updates: ["v-update"] });
    const createdId = items.find((i) => i.action === "create")!.id;
    const edited = await activityService.get(admin, createdId);
    await activityService.update(admin, createdId, { ...input(9, "v-create"), title: "Edited after the import" }, { expectedVersion: edited.version });
    const before = await snapshot(batchId);
    const res = await revertVia(staff.admin, batchId);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("CONFLICT");
    expect(res.body.error?.details?.slugs).toEqual([slug("v-create")]);
    expect(await snapshot(batchId)).toEqual(before);
    // The untouched update row was not restored on its own either.
    expect((await activityService.get(admin, updatedIds[0])).content.title).toBe("Imported v-update");
  }, 90_000);

  it("a created listing already deleted directly makes rollback a 409 (version moved), not a silent skip", async () => {
    const { batchId, items } = await appliedBatch(admin, { creates: ["d-create"] });
    await activityService.remove(admin, items[0].id, "removed by hand");
    const before = await snapshot(batchId);
    await expect(importService.revert(admin, batchId)).rejects.toMatchObject({ code: "CONFLICT", details: { slugs: [slug("d-create")] } });
    expect(await snapshot(batchId)).toEqual(before);
  }, 90_000);

  it("an already-reverted batch is a 409 and changes nothing", async () => {
    const { batchId } = await appliedBatch(admin, { creates: ["r-create"] });
    expect((await revertVia(staff.admin, batchId)).status).toBe(200);
    const before = await snapshot(batchId);
    const again = await revertVia(staff.admin, batchId);
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe("CONFLICT");
    expect(await snapshot(batchId)).toEqual(before);
  }, 90_000);

  it("two concurrent rollbacks: exactly one writes, the other conflicts", async () => {
    const { batchId } = await appliedBatch(admin, { creates: ["cc-create"], updates: ["cc-update"] });
    const before = await snapshot(batchId);
    const results = await Promise.allSettled([importService.revert(admin, batchId), importService.revert(admin2, batchId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "CONFLICT" });
    const after = await snapshot(batchId);
    // One rollback: one archive version for the created row, one restore version for the updated row.
    expect(after.versions.length).toBe(before.versions.length + 2);
    expect(after.status).toBe("reverted");
    expect(await prisma.auditLog.count({ where: { entityId: batchId, action: "import.revert" } })).toBe(1);
  }, 90_000);

  it("a save that commits between the rollback's check and its write is a 409, not overwritten", async () => {
    const { batchId, items } = await appliedBatch(admin, { creates: ["w-create"] });
    const id = items[0].id;
    const before = await snapshot(batchId);

    // A competing save holds the product row (uncommitted version bump) while the rollback runs:
    // the rollback reads the committed afterVersion, passes its check, then blocks on the row lock.
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const competitor = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`UPDATE products SET version = version + 1, title = 'Concurrent save' WHERE id = ${id}::uuid`;
        locked();
        await released;
      },
      { timeout: 30_000 },
    );
    await isLocked;
    const rollback = importService.revert(admin, batchId).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    // Wait until the rollback is actually waiting on the competitor's row lock.
    let sawWait = false;
    for (let i = 0; i < 200 && !sawWait; i++) {
      const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      sawWait = waiting > 0;
      if (!sawWait) await new Promise((r) => setTimeout(r, 25));
    }
    release();
    expect(sawWait, "the rollback never reached the guarded write while the competitor held the row").toBe(true);
    await competitor;
    const outcome = await rollback;
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? null : outcome.error).toMatchObject({ code: "CONFLICT" });
    const after = await snapshot(batchId);
    // Only the competitor's change landed: no archive, no rollback version row, batch still applied.
    expect(after.status).toBe("applied");
    expect(after.versions).toEqual(before.versions);
    expect(after.audits).toBe(before.audits);
    expect(after.products[0]).toMatchObject({ version: before.products[0].version + 1, title: "Concurrent save", deletedAt: null });
  }, 90_000);

  /* ------------------------------------------------------------ controls */

  it("controls: direct delete is refused for content and allowed for admin", async () => {
    const row = await activityService.create(admin, input(3, "direct-del"));
    const del = (who: StaffFixture) => activityDELETE(apiRequest(`/api/admin/activities/${row.id}`, { method: "DELETE", body: { reason: "Synthetic delete control" }, cookie: who.cookie }), params({ id: row.id }));
    const denied = await del(staff.content);
    expect(denied.status).toBe(403);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: row.id } })).deletedAt).toBeNull();
    const allowed = await del(staff.admin);
    expect(allowed.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: row.id } })).deletedAt).not.toBeNull();
  }, 90_000);

  it("controls: content can still preview, apply and edit through the routes", async () => {
    const pv = await previewPOST(apiRequest("/api/admin/imports/preview", { body: { source: "bulk", items: [input(4, "ctl-new")] }, cookie: staff.content.cookie }), params({}));
    expect(pv.status).toBe(201);
    const { batchId } = (await pv.json()) as { batchId: string };
    const ap = await applyPOST(apiRequest(`/api/admin/imports/${batchId}/apply`, { body: {}, cookie: staff.content.cookie }), params({ id: batchId }));
    expect(ap.status, await ap.clone().text()).toBe(200);
    const row = await prisma.product.findUniqueOrThrow({ where: { slug: slug("ctl-new") } });
    const patch = await activityPATCH(
      apiRequest(`/api/admin/activities/${row.id}`, { method: "PATCH", body: { activity: input(4, "ctl-new", { title: "Edited by content" }), expectedVersion: row.version }, cookie: staff.content.cookie }),
      params({ id: row.id }),
    );
    expect(patch.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: row.id } })).title).toBe("Edited by content");
  }, 90_000);

  it("apply also requires products.edit (it creates and updates listings)", async () => {
    const importOnly: Actor = { type: "admin", id: staff.admin.id, roles: ["custom"], permissions: new Set(["imports.run"]) };
    const preview = await importService.preview(admin, { source: "bulk", items: [input(5, "edit-perm")] });
    await expect(importService.apply(importOnly, preview.batchId)).rejects.toMatchObject({ code: "FORBIDDEN", details: { permission: "products.edit" } });
    expect(await prisma.product.count({ where: { slug: slug("edit-perm") } })).toBe(0);
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.batchId } })).status).toBe("previewed");
    // Every built-in role that can run an import can also edit listings.
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) if (perms.includes("imports.run")) expect(perms, role).toContain("products.edit");
  }, 90_000);
});

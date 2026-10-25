import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { activities } from "@/lib/data/activities";
import type { Actor } from "../../lib/actor";
import { ROLE_PERMISSIONS } from "../../lib/permissions";
import { activityInputSchema } from "../../schemas/activity.schema";
import { apiRequest, assertDisposableDb, cleanupPeople, createStaff, dbEnabled, params, runId, type StaffFixture } from "../helpers/fixtures";

/**
 * Import preview / apply boundaries: body ceilings on both preview paths,
 * strict envelopes, the binding between a stored preview and what apply
 * writes, and export access. Real route handlers + the disposable local DB.
 * Rows carry `zz-sec-<run>-`; removed in afterAll (audit rows stay).
 */

const RUN = runId();
const slug = (s: string) => `zz-sec-${RUN}-${s}`;

function input(i: number, s: string, patch: Record<string, unknown> = {}) {
  const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest } = activities[i % activities.length];
  return activityInputSchema.parse({ ...rest, slug: slug(s), relatedSlugs: [], comboSlugs: [], ...patch });
}

async function multipart(fields: Record<string, string | File>): Promise<{ bytes: Uint8Array; contentType: string }> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const res = new Response(fd);
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type")! };
}

describe.skipIf(!dbEnabled)("import preview / apply boundaries", () => {
  let prisma: typeof import("../../lib/db").prisma;
  let importService: typeof import("../../services/import.service").importService;
  let previewPOST: typeof import("@/app/api/admin/imports/preview/route").POST;
  let applyPOST: typeof import("@/app/api/admin/imports/[id]/apply/route").POST;
  let revertPOST: typeof import("@/app/api/admin/imports/[id]/revert/route").POST;
  let exportGET: typeof import("@/app/api/admin/imports/export/route").GET;
  let admin: StaffFixture;
  let content: StaffFixture;
  let readonly: StaffFixture;
  let adminActor: Actor;

  beforeAll(async () => {
    assertDisposableDb();
    ({ prisma } = await import("../../lib/db"));
    ({ importService } = await import("../../services/import.service"));
    ({ POST: previewPOST } = await import("@/app/api/admin/imports/preview/route"));
    ({ POST: applyPOST } = await import("@/app/api/admin/imports/[id]/apply/route"));
    ({ POST: revertPOST } = await import("@/app/api/admin/imports/[id]/revert/route"));
    ({ GET: exportGET } = await import("@/app/api/admin/imports/export/route"));
    admin = await createStaff(RUN, "admin", ["admin"]);
    content = await createStaff(RUN, "content", ["content"]);
    readonly = await createStaff(RUN, "readonly", ["readonly"]);
    adminActor = { type: "admin", id: admin.id, roles: ["admin"], permissions: new Set(ROLE_PERMISSIONS.admin) };
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [admin, content, readonly].filter(Boolean).map((s) => s.id);
    await prisma.importBatch.deleteMany({ where: { createdBy: { in: ids } } });
    await prisma.productSupplierMapping.deleteMany({ where: { product: { slug: { startsWith: `zz-sec-${RUN}-` } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: `zz-sec-${RUN}-` } } });
    await prisma.rateLimitBucket.deleteMany({ where: { OR: ids.map((id) => ({ key: { contains: id } })) } });
    await cleanupPeople(RUN);
    await prisma.$disconnect();
  });

  const preview = (who: StaffFixture, opts: Parameters<typeof apiRequest>[1]) => previewPOST(apiRequest("/api/admin/imports/preview", { cookie: who.cookie, ...opts }), params({}));
  const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; details?: { fields?: Record<string, string> } } }).error;

  /* ------------------------------------------------------------ body caps */

  it("JSON preview: a body over the 12 MiB ceiling is 413 before it is parsed", async () => {
    const res = await preview(content, { rawBody: JSON.stringify({ source: "csv", text: "a".repeat(12 * 1024 * 1024 + 1) }), contentType: "application/json" });
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("JSON preview: under the byte ceiling but over the schema's 5,000,000 characters is 422", async () => {
    const res = await preview(content, { body: { source: "csv", text: "a".repeat(5_000_001) } });
    expect(res.status).toBe(422);
  });

  it("JSON preview: a non-JSON content type is 415", async () => {
    const res = await preview(content, { rawBody: JSON.stringify({ source: "bulk", items: [{}] }), contentType: "text/plain" });
    expect(res.status).toBe(415);
  });

  it("JSON preview: unknown envelope keys are 422", async () => {
    const res = await preview(content, { body: { source: "bulk", items: [input(0, "x")], publish: true } });
    expect(res.status).toBe(422);
  });

  it("multipart preview: a body over the multipart ceiling is 413 (read with a hard limit before parsing)", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 512 * 1024).fill(0x61)], "big.csv", { type: "text/csv" });
    const { bytes, contentType } = await multipart({ file: big });
    const res = await preview(content, { rawBody: bytes, contentType });
    expect(res.status).toBe(413);
  });

  it("multipart preview: a file over 5 MB inside the ceiling is 422", async () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 64 * 1024).fill(0x61)], "big.csv", { type: "text/csv" });
    const { bytes, contentType } = await multipart({ file });
    const res = await preview(content, { rawBody: bytes, contentType });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.fields?.file).toMatch(/5 MB/);
  });

  it("multipart preview: malformed mapping JSON and unknown mapping fields are 422; a malformed body is 422", async () => {
    const file = new File([`slug,title\n${slug("mp")},Multipart Tour\n`], "ok.csv", { type: "text/csv" });
    const bad = await multipart({ file, mapping: "{not json" });
    expect((await preview(content, { rawBody: bad.bytes, contentType: bad.contentType })).status).toBe(422);
    const unknown = await multipart({ file, mapping: JSON.stringify({ isAdmin: "slug" }) });
    expect((await preview(content, { rawBody: unknown.bytes, contentType: unknown.contentType })).status).toBe(422);
    const garbage = await preview(content, { rawBody: "--x\r\nnot a part", contentType: "multipart/form-data; boundary=zzz" });
    expect(garbage.status).toBe(422);
  });

  it("multipart preview: a normal CSV upload still previews (201)", async () => {
    const file = new File([`slug,title,tier,categorySlug,location,price.adult.inr,price.adult.aed,freeCancellationHours,inclusions,meetingPoint\n${slug("mp-ok")},Multipart Tour,B,desert-safari,Al Awir,2990,129,24,Dunes,Camp gate\n`], "ok.csv", { type: "text/csv" });
    const { bytes, contentType } = await multipart({ file });
    const res = await preview(content, { rawBody: bytes, contentType });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { rowsTotal: number; rows: { action: string }[] };
    expect(body.rowsTotal).toBe(1);
    expect(body.rows[0].action).toBe("create");
  });

  /* -------------------------------------------------- stored preview binding */

  it("apply refuses a stored preview whose row no longer matches its input (tampered slug / action / baseVersion / extra key)", async () => {
    const tamper = async (mutate: (rows: Record<string, unknown>[]) => void) => {
      const p = await importService.preview(adminActor, { source: "bulk", items: [input(1, "tamper")] });
      const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: p.batchId } });
      const rows = structuredClone(batch.preview) as Record<string, unknown>[];
      mutate(rows);
      await prisma.importBatch.update({ where: { id: p.batchId }, data: { preview: rows as unknown as Prisma.InputJsonValue } });
      return p.batchId;
    };
    const slugMismatch = await tamper((rows) => {
      rows[0].slug = slug("other");
    });
    await expect(importService.apply(adminActor, slugMismatch)).rejects.toMatchObject({ code: "CONFLICT" });
    const fakeUpdate = await tamper((rows) => {
      rows[0].action = "update";
    });
    await expect(importService.apply(adminActor, fakeUpdate)).rejects.toMatchObject({ code: "CONFLICT" });
    const extraKey = await tamper((rows) => {
      (rows[0].input as Record<string, unknown>).isAdmin = true;
    });
    await expect(importService.apply(adminActor, extraKey)).rejects.toThrow();
    expect(await prisma.product.count({ where: { slug: { in: [slug("tamper"), slug("other")] } } })).toBe(0);
    for (const id of [slugMismatch, fakeUpdate, extraKey]) expect((await prisma.importBatch.findUniqueOrThrow({ where: { id } })).status).toBe("failed");
  }, 90_000);

  it("apply and revert envelopes are strict (unknown keys are 422)", async () => {
    const p = await importService.preview(adminActor, { source: "bulk", items: [input(2, "strict")] });
    const ap = await applyPOST(apiRequest(`/api/admin/imports/${p.batchId}/apply`, { body: { force: true }, cookie: admin.cookie }), params({ id: p.batchId }));
    expect(ap.status).toBe(422);
    const rv = await revertPOST(apiRequest(`/api/admin/imports/${p.batchId}/revert`, { body: { force: true }, cookie: admin.cookie }), params({ id: p.batchId }));
    expect(rv.status).toBe(422);
  }, 90_000);

  /* --------------------------------------------------------------- export */

  it("export needs products.edit: content gets CSV with formula-like text guarded, readonly is refused", async () => {
    await importService.apply(adminActor, (await importService.preview(adminActor, { source: "bulk", items: [input(3, "export", { title: "-1+2 Export Check" })] })).batchId);
    const ok = await exportGET(apiRequest("/api/admin/imports/export", { cookie: content.cookie }), params({}));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toMatch(/^text\/csv/);
    const line = (await ok.text()).split("\r\n").find((l) => l.startsWith(`${slug("export")},`));
    expect(line).toContain(",'-1+2 Export Check,");
    const denied = await exportGET(apiRequest("/api/admin/imports/export", { cookie: readonly.cookie }), params({}));
    expect(denied.status).toBe(403);
  }, 90_000);
});

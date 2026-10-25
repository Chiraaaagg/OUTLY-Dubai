import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  apiRequest,
  assertDisposableDb,
  cleanupPeople,
  createCustomer,
  createStaff,
  dbEnabled,
  params,
  runId,
  syntheticPhone,
  type CustomerFixture,
  type StaffFixture,
} from "../helpers/fixtures";
import { uuidv7 } from "@/server/lib/ids";

/**
 * H04 — every cookie-authenticated mutation route, and every public JSON
 * mutation route, called directly as a route handler:
 *
 *   - foreign Origin, `Origin: null`, no Origin, and `Sec-Fetch-Site:
 *     cross-site` → 403, even with a valid session cookie;
 *   - same origin but `text/plain`, urlencoded or multipart → 415 on every
 *     JSON route (form encodings are what a cross-site <form> can send);
 *   - representative same-origin JSON calls still succeed;
 *   - the deliberate exceptions still work: `/api/events` takes a
 *     same-origin text/plain beacon, the WhatsApp webhook takes a signed
 *     request with no Origin, cron jobs take the secret with no Origin.
 *
 * What this does NOT claim: these are handcrafted requests. A real browser
 * cannot drop or forge `Origin` on a cross-site POST, so "missing Origin"
 * here is a non-browser client, not a CSRF exploit; it is refused because
 * nothing about it proves it came from our pages.
 */

const run = runId();
const ID = uuidv7();
const ID2 = uuidv7();
const savedTrust = process.env.TRUST_PROXY_IP_HEADERS;
const runOctet = (Number.parseInt(run.slice(-2), 16) % 200) + 20;
/** Unique trusted IP per run so IP-keyed limits (lookup, OTP) start empty. */
const IP = `198.19.${runOctet}.9`;

type Auth = "admin" | "customer" | "public" | "pending";
/** json: body parsed by `parseJson`; none: no body read; optional: may be empty, JSON if not. */
type BodyKind = "json" | "none" | "optional";
interface RouteCase {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  file: string;
  auth: Auth;
  body: BodyKind;
  params?: Record<string, string>;
  /** multipart is an accepted upload format on this route (authenticated, origin-checked). */
  multipartAllowed?: boolean;
  load: () => Promise<Record<string, unknown>>;
}

const R = (method: RouteCase["method"], file: string, auth: Auth, body: BodyKind, load: RouteCase["load"], extra: Partial<RouteCase> = {}): RouteCase => {
  const p = extra.params ?? {};
  const urlPath = `/api/${file}`.replace("[id]", p.id ?? "").replace("[itemId]", p.itemId ?? "");
  return { method, path: urlPath, file, auth, body, load, ...extra };
};
const id = { params: { id: ID } };

const ROUTES: RouteCase[] = [
  R("POST", "admin/activities", "admin", "json", () => import("@/app/api/admin/activities/route")),
  R("PATCH", "admin/activities/[id]", "admin", "json", () => import("@/app/api/admin/activities/[id]/route"), id),
  R("DELETE", "admin/activities/[id]", "admin", "json", () => import("@/app/api/admin/activities/[id]/route"), id),
  R("POST", "admin/activities/[id]/duplicate", "admin", "none", () => import("@/app/api/admin/activities/[id]/duplicate/route"), id),
  R("POST", "admin/activities/[id]/restore", "admin", "none", () => import("@/app/api/admin/activities/[id]/restore/route"), id),
  R("POST", "admin/activities/[id]/restore-version", "admin", "json", () => import("@/app/api/admin/activities/[id]/restore-version/route"), id),
  R("POST", "admin/activities/[id]/status", "admin", "json", () => import("@/app/api/admin/activities/[id]/status/route"), id),
  R("POST", "admin/auth/login", "public", "json", () => import("@/app/api/admin/auth/login/route")),
  R("POST", "admin/auth/logout", "admin", "none", () => import("@/app/api/admin/auth/logout/route")),
  R("POST", "admin/auth/totp/enrol", "pending", "none", () => import("@/app/api/admin/auth/totp/enrol/route")),
  R("POST", "admin/auth/totp/verify", "pending", "json", () => import("@/app/api/admin/auth/totp/verify/route")),
  R("POST", "admin/categories", "admin", "json", () => import("@/app/api/admin/categories/route")),
  R("PATCH", "admin/categories/[id]", "admin", "json", () => import("@/app/api/admin/categories/[id]/route"), id),
  R("DELETE", "admin/categories/[id]", "admin", "json", () => import("@/app/api/admin/categories/[id]/route"), id),
  R("POST", "admin/imports/[id]/apply", "admin", "json", () => import("@/app/api/admin/imports/[id]/apply/route"), id),
  R("POST", "admin/imports/[id]/revert", "admin", "json", () => import("@/app/api/admin/imports/[id]/revert/route"), id),
  R("POST", "admin/imports/fetch", "admin", "json", () => import("@/app/api/admin/imports/fetch/route")),
  R("POST", "admin/imports/preview", "admin", "json", () => import("@/app/api/admin/imports/preview/route"), { multipartAllowed: true }),
  R("POST", "admin/products/[id]/fulfilment-mode", "admin", "json", () => import("@/app/api/admin/products/[id]/fulfilment-mode/route"), id),
  R("PUT", "admin/settings", "admin", "json", () => import("@/app/api/admin/settings/route")),
  R("POST", "admin/users", "admin", "json", () => import("@/app/api/admin/users/route")),
  R("PATCH", "admin/users/[id]", "admin", "json", () => import("@/app/api/admin/users/[id]/route"), id),
  R("POST", "admin/users/[id]/reset", "admin", "optional", () => import("@/app/api/admin/users/[id]/reset/route"), id),
  R("POST", "agent/inquiries/[id]/assign", "admin", "json", () => import("@/app/api/agent/inquiries/[id]/assign/route"), id),
  R("POST", "agent/inquiries/[id]/claim", "admin", "none", () => import("@/app/api/agent/inquiries/[id]/claim/route"), id),
  R("POST", "agent/inquiries/[id]/contact", "admin", "json", () => import("@/app/api/agent/inquiries/[id]/contact/route"), id),
  R("POST", "agent/inquiries/[id]/convert", "admin", "json", () => import("@/app/api/agent/inquiries/[id]/convert/route"), id),
  R("PATCH", "agent/inquiries/[id]/items/[itemId]", "admin", "json", () => import("@/app/api/agent/inquiries/[id]/items/[itemId]/route"), { params: { id: ID, itemId: ID2 } }),
  R("POST", "agent/inquiries/[id]/notes", "admin", "json", () => import("@/app/api/agent/inquiries/[id]/notes/route"), id),
  R("POST", "agent/inquiries/[id]/spam", "admin", "json", () => import("@/app/api/agent/inquiries/[id]/spam/route"), id),
  R("POST", "agent/inquiries/[id]/status", "admin", "json", () => import("@/app/api/agent/inquiries/[id]/status/route"), id),
  R("POST", "agent/inquiries/[id]/unassign", "admin", "json", () => import("@/app/api/agent/inquiries/[id]/unassign/route"), id),
  R("POST", "agent/notifications/[id]/resend", "admin", "none", () => import("@/app/api/agent/notifications/[id]/resend/route"), id),
  R("POST", "auth/logout", "customer", "none", () => import("@/app/api/auth/logout/route")),
  R("POST", "auth/otp/request", "public", "json", () => import("@/app/api/auth/otp/request/route")),
  R("POST", "auth/otp/verify", "public", "json", () => import("@/app/api/auth/otp/verify/route")),
  R("POST", "auth/otp/widget", "public", "json", () => import("@/app/api/auth/otp/widget/route")),
  R("POST", "inquiries", "public", "json", () => import("@/app/api/inquiries/route")),
  R("POST", "inquiries/lookup", "public", "json", () => import("@/app/api/inquiries/lookup/route")),
  R("POST", "me/delete-request", "customer", "optional", () => import("@/app/api/me/delete-request/route")),
  R("PUT", "me/preferences", "customer", "json", () => import("@/app/api/me/preferences/route")),
  R("PATCH", "me", "customer", "json", () => import("@/app/api/me/route")),
];

/** Mutation handlers that authenticate without a browser and are tested as exceptions below. */
const NON_BROWSER = new Set(["POST webhooks/whatsapp", "POST jobs/inquiry-sweep", "POST jobs/offline-conversions", "POST events"]);

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

let admin: StaffFixture;
let target: StaffFixture;
let customer: CustomerFixture;
let prisma: typeof import("@/server/lib/db").prisma;

function cookieFor(auth: Auth): string | undefined {
  if (auth === "admin") return admin.cookie;
  if (auth === "customer") return customer.cookie;
  return undefined;
}

async function call(rc: RouteCase, opts: Parameters<typeof apiRequest>[1] = {}): Promise<Response> {
  const mod = await rc.load();
  const fn = mod[rc.method] as Handler;
  const headers = { "x-real-ip": IP, ...(opts.headers ?? {}) };
  return fn(apiRequest(rc.path, { method: rc.method, cookie: cookieFor(rc.auth), ...opts, headers }), params(rc.params ?? {}));
}

describe.skipIf(!dbEnabled)("H04 origin and media type on mutation routes", () => {
  beforeAll(async () => {
    assertDisposableDb();
    process.env.TRUST_PROXY_IP_HEADERS = "true";
    prisma = (await import("@/server/lib/db")).prisma;
    admin = await createStaff(run, "admin", ["admin"]);
    target = await createStaff(run, "target", ["agent"]);
    customer = await createCustomer(run, syntheticPhone(run, 1));
  });

  afterAll(async () => {
    if (savedTrust === undefined) delete process.env.TRUST_PROXY_IP_HEADERS;
    else process.env.TRUST_PROXY_IP_HEADERS = savedTrust;
    if (prisma) await cleanupPeople(run);
  });

  it("the table covers every browser mutation handler under src/app/api", () => {
    const root = path.resolve(process.cwd(), "src/app/api");
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === "route.ts") {
          const src = readFileSync(full, "utf8");
          const rel = path.relative(root, dir).split(path.sep).join("/");
          for (const m of src.matchAll(/export (?:const|async function) (POST|PUT|PATCH|DELETE)\b/g)) found.push(`${m[1]} ${rel}`);
        }
      }
    };
    walk(root);
    const covered = new Set(ROUTES.map((r) => `${r.method} ${r.file}`));
    const missing = found.filter((k) => !covered.has(k) && !NON_BROWSER.has(k));
    expect(missing).toEqual([]);
  });

  describe.each(ROUTES.map((r) => [`${r.method} ${r.path}`, r] as const))("%s", (_label, rc) => {
    const body = rc.body === "none" ? undefined : {};
    it.each([
      ["foreign Origin", { origin: "https://evil.example" }],
      ["Origin: null", { origin: "null" }],
      ["no Origin", { origin: null }],
      ["lookalike Origin", { origin: "https://localhost:3000.evil.example" }],
      ["allowed Origin but Sec-Fetch-Site: cross-site", { headers: { "sec-fetch-site": "cross-site" } }],
    ] as const)("%s → 403", async (_l, o) => {
      const res = await call(rc, { body, ...o });
      expect(res.status).toBe(403);
    });

    if (rc.body !== "none") {
      it.each([
        ["text/plain", "text/plain;charset=UTF-8", '{"a":1}'],
        ["urlencoded form", "application/x-www-form-urlencoded", "a=1"],
        ["multipart form", "multipart/form-data; boundary=zzsec", '--zzsec\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--zzsec--\r\n'],
      ] as const)("same origin, %s body → 415", async (label, contentType, rawBody) => {
        const res = await call(rc, { rawBody, contentType });
        if (label === "multipart form" && rc.multipartAllowed) {
          // CSV upload: multipart is the accepted format here; the form lacks a file.
          expect(res.status).toBe(422);
          return;
        }
        expect(res.status).toBe(415);
      });
    }
  });

  describe("no state change on refusal (real fixtures)", () => {
    const usersRoute = ROUTES.find((r) => r.file === "admin/users")!;
    const userRoute = ROUTES.find((r) => r.file === "admin/users/[id]")!;
    const meRoute = ROUTES.find((r) => r.file === "me" && r.method === "PATCH")!;
    const inquiriesRoute = ROUTES.find((r) => r.file === "inquiries")!;
    const adminLogout = ROUTES.find((r) => r.file === "admin/auth/logout")!;

    it("creating a staff user: refused requests create nothing", async () => {
      const before = await prisma.adminUser.count();
      const body = { email: `zz-sec-${run}-csrf@outlyy.test`, fullName: "Should Not Exist", roles: ["readonly"] };
      expect((await call(usersRoute, { body, origin: "https://evil.example" })).status).toBe(403);
      expect((await call(usersRoute, { body, origin: null })).status).toBe(403);
      expect((await call(usersRoute, { rawBody: JSON.stringify(body), contentType: "text/plain" })).status).toBe(415);
      expect(await prisma.adminUser.count()).toBe(before);
    });

    it("suspending another staff user: refused requests leave them active with live sessions", async () => {
      const rc = { ...userRoute, params: { id: target.id }, path: `/api/admin/users/${target.id}` };
      const body = { status: "suspended" };
      expect((await call(rc, { body, origin: "null" })).status).toBe(403);
      expect((await call(rc, { body, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
      expect((await call(rc, { rawBody: "status=suspended", contentType: "application/x-www-form-urlencoded" })).status).toBe(415);
      const row = await prisma.adminUser.findUnique({ where: { id: target.id } });
      expect(row?.status).toBe("active");
      const session = await prisma.adminSession.findUnique({ where: { id: target.sessionId } });
      expect(session?.revokedAt).toBeNull();
    });

    it("editing the customer profile: refused requests change nothing; same-origin JSON succeeds", async () => {
      expect((await call(meRoute, { body: { hotel: "CSRF Hotel" }, origin: "https://evil.example" })).status).toBe(403);
      expect((await call(meRoute, { rawBody: "hotel=CSRF+Hotel", contentType: "application/x-www-form-urlencoded" })).status).toBe(415);
      expect((await prisma.customer.findUnique({ where: { id: customer.id } }))?.hotel).toBeNull();
      const ok = await call(meRoute, { body: { hotel: `zz-sec-${run} hotel` } });
      expect(ok.status).toBe(200);
      expect((await prisma.customer.findUnique({ where: { id: customer.id } }))?.hotel).toBe(`zz-sec-${run} hotel`);
    });

    it("submitting an inquiry as a form or text creates nothing", async () => {
      const before = await prisma.inquiry.count();
      const res = await call(inquiriesRoute, { rawBody: JSON.stringify({ leadName: "zz", leadPhone: "9999999999", countryCode: "IN", items: [] }), contentType: "text/plain" });
      expect(res.status).toBe(415);
      expect(await prisma.inquiry.count()).toBe(before);
    });

    it("staff logout: a cross-site request does not revoke the session; same-origin does", async () => {
      const victim = await createStaff(run, "logout", ["readonly"]);
      const rc = { ...adminLogout, auth: "public" as Auth };
      expect((await call(rc, { cookie: victim.cookie, origin: "https://evil.example" })).status).toBe(403);
      expect((await prisma.adminSession.findUnique({ where: { id: victim.sessionId } }))?.revokedAt).toBeNull();
      expect((await call(rc, { cookie: victim.cookie })).status).toBe(200);
      expect((await prisma.adminSession.findUnique({ where: { id: victim.sessionId } }))?.revokedAt).not.toBeNull();
    });

    it("same-origin JSON staff-user creation succeeds", async () => {
      const res = await call(usersRoute, { body: { email: `zz-sec-${run}-created@outlyy.test`, fullName: "Fixture Created", roles: ["readonly"] } });
      expect(res.status).toBe(201);
      expect(await prisma.adminUser.count({ where: { email: `zz-sec-${run}-created@outlyy.test` } })).toBe(1);
    });

    it("an empty optional body is still accepted where the route allows it", async () => {
      const rc = ROUTES.find((r) => r.file === "me/delete-request")!;
      const res = await call(rc, { rawBody: "", contentType: null });
      expect(res.status).toBe(200);
    });
  });

  describe("deliberate exceptions", () => {
    it("/api/events accepts a same-origin text/plain beacon", async () => {
      const { POST } = await import("@/app/api/events/route");
      const res = await POST(apiRequest("/api/events", { rawBody: JSON.stringify([{ event: "page_view", event_id: `zz-sec-${run}-om`, page_path: "/" }]), contentType: "text/plain;charset=UTF-8", headers: { "x-real-ip": IP } }), params({}));
      expect(res.status).toBe(204);
      await prisma.analyticsEvent.deleteMany({ where: { eventId: `zz-sec-${run}-om` } });
    });

    it("the WhatsApp webhook accepts a correctly signed request with no Origin", async () => {
      const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
      expect(secret, "test env must define a local WHATSAPP_WEBHOOK_SECRET").toBeTruthy();
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = JSON.stringify({ object: "whatsapp_business_account", entry: [], note: `zz-sec-${run}-om` });
      const sig = `sha256=${createHmac("sha256", secret!).update(body).digest("hex")}`;
      const res = await POST(apiRequest("/api/webhooks/whatsapp", { rawBody: body, origin: null, headers: { "x-hub-signature-256": sig } }));
      expect(res.status).toBe(200);
      await prisma.webhookEvent.deleteMany({ where: { payload: { path: ["note"], equals: `zz-sec-${run}-om` } } });
    });

    it("cron jobs accept the secret with no Origin, and refuse without it", async () => {
      const secret = process.env.CRON_SECRET;
      expect(secret, "test env must define a local CRON_SECRET").toBeTruthy();
      const { POST } = await import("@/app/api/jobs/inquiry-sweep/route");
      const denied = await POST(apiRequest("/api/jobs/inquiry-sweep", { method: "POST", origin: null }), params({}));
      expect(denied.status).toBe(401);
      const ok = await POST(apiRequest("/api/jobs/inquiry-sweep", { method: "POST", origin: null, headers: { authorization: `Bearer ${secret}` } }), params({}));
      expect(ok.status).toBe(200);
    });
  });
});

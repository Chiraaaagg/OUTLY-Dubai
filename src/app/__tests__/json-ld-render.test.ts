import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activities } from "@/lib/data/activities";
import { landingBySlug } from "@/lib/data/landing-pages";
import { CURRENCY_BOOTSTRAP_SCRIPT } from "@/lib/currency";
import { googleTagBootstrap } from "@/lib/google-tag";
import { assertDisposableDb, apiRequest, cleanupPeople, createStaff, params, runId, type StaffFixture } from "@/server/__tests__/helpers/fixtures";

/**
 * F01 / H01 — staff-edited catalogue text must not break out of the JSON-LD
 * `<script type="application/ld+json">` element on rendered storefront pages.
 *
 * This renders the REAL pages: it needs a running Next server pointed at the
 * same disposable database, and is skipped unless JSON_LD_RENDER_BASE names it.
 *
 *   DATABASE_URL=postgresql://outly:outly_local_only@127.0.0.1:55433/outly_luna?schema=public \
 *   DIRECT_URL=$DATABASE_URL npx next dev -p 3217 -H 127.0.0.1      # terminal 1
 *
 *   DATABASE_URL=... DIRECT_URL=... JSON_LD_RENDER_BASE=http://127.0.0.1:3217 \
 *   npx vitest run src/app/__tests__/json-ld-render.test.ts           # terminal 2
 *
 * Fixtures are written through the admin route handlers with real staff
 * sessions: an admin creates and publishes; a `content` user (products.edit,
 * categories.edit, no products.publish) creates the categories and edits an
 * already-published activity — the assessment's path, which keeps it live.
 * Rows are tagged `zz-sec-<run>-` and removed in afterAll unless
 * JSON_LD_RENDER_KEEP=1 (for a follow-up browser check). Audit rows stay:
 * audit_logs is append-only by design.
 *
 * Assertions per page, from a spec-shaped scan of the HTML (script data,
 * escaped and double-escaped states, case-insensitive end tag):
 *  - exactly one ld+json element, and its body JSON.parses back to the exact
 *    strings that were stored;
 *  - every inline executable script is a known one (currency bootstrap, GA
 *    bootstrap, React/Next runtime, or an RSC flight push whose argument
 *    JSON.parses), so no element exists that the payload created;
 *  - the marker never appears in an executable script except as JSON string
 *    data inside a flight push.
 */

const BASE = process.env.JSON_LD_RENDER_BASE;
const KEEP = process.env.JSON_LD_RENDER_KEEP === "1";
const MARKER = "lunaProof";

const P1 = `</script><script>document.documentElement.dataset.${MARKER}=1</script>`;
const P2 = `</ScRiPt><sCrIpT>document.documentElement.dataset.${MARKER}=2</sCrIpT>`;
const P3 = `<!--</script ><script>document.documentElement.dataset.${MARKER}=3</script>-->`;
const P4 = `"quote'   Ünïcödé — بُرْج </script/><script>document.documentElement.dataset.${MARKER}=4</script>`;

/* ------------------------------------------------------------ HTML scan */

interface ScriptEl {
  attrs: Record<string, string>;
  body: string;
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const m of raw.matchAll(re)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

const END_TAG = /^<\/script[\s/>]/i;
const START_TAG = /^<script[\s/>]/i;

/**
 * Every <script> element as an HTML parser sees it. Outside scripts React
 * escapes `<` in text and attributes, so a literal `<script` there is a real
 * tag. Inside, this follows the script-data states of the HTML standard:
 * `<!--` enters the escaped state, `<script` inside that enters double-escaped
 * (where `</script` only drops back to escaped), `-->` returns to plain data,
 * and anywhere else `</script` followed by whitespace, `/` or `>` ends it.
 */
function scanScripts(html: string): ScriptEl[] {
  const out: ScriptEl[] = [];
  let i = 0;
  for (;;) {
    const start = html.slice(i).search(/<script[\s/>]/i);
    if (start < 0) break;
    const tagStart = i + start;
    const tagEnd = html.indexOf(">", tagStart);
    if (tagEnd < 0) break;
    const attrs = parseAttrs(html.slice(tagStart + 7, tagEnd).replace(/\/$/, ""));
    let j = tagEnd + 1;
    let state: "data" | "escaped" | "double" = "data";
    let bodyEnd = html.length;
    while (j < html.length) {
      const rest = html.slice(j, j + 10);
      if (state === "data") {
        if (rest.startsWith("<!--")) { state = "escaped"; j += 4; continue; }
        if (END_TAG.test(rest)) { bodyEnd = j; break; }
      } else if (state === "escaped") {
        if (rest.startsWith("-->")) { state = "data"; j += 3; continue; }
        if (END_TAG.test(rest)) { bodyEnd = j; break; }
        if (START_TAG.test(rest)) { state = "double"; j += 7; continue; }
      } else {
        if (rest.startsWith("-->")) { state = "data"; j += 3; continue; }
        if (END_TAG.test(rest)) { state = "escaped"; j += 8; continue; }
      }
      j += 1;
    }
    out.push({ attrs, body: html.slice(tagEnd + 1, bodyEnd) });
    const close = html.indexOf(">", bodyEnd);
    i = close < 0 ? html.length : close + 1;
  }
  return out;
}

const JS_TYPES = new Set(["", "text/javascript", "application/javascript", "module", "text/ecmascript", "application/ecmascript"]);
const isExecutable = (s: ScriptEl) => JS_TYPES.has((s.attrs.type ?? "").trim().toLowerCase());

const FLIGHT = [/^\(self\.__next_f=self\.__next_f\|\|\[\]\)\.push\(([\s\S]*)\)$/, /^self\.__next_f\.push\(([\s\S]*)\)$/];
/**
 * React/Next streaming runtime and bootstrap snippets (fixed code, no catalogue
 * data). The Turbopack chunk-loader push (`<script id="_R_">`) appears only in
 * production builds (`next start`), not under `next dev`.
 */
const RUNTIME = [
  /^requestAnimationFrame\(function\(\)\{\$RT=/,
  /^\$RB=\[\];\$RV=/,
  /^\$R[CSX]\(/,
  /^self\.__next_r=/,
  /^\(globalThis\["TURBOPACK"\] \|\| \(globalThis\["TURBOPACK"\] = \[\]\)\)\.push\(\{"otherChunks":/,
];

function flightArg(body: string): unknown | undefined {
  for (const re of FLIGHT) {
    const m = re.exec(body);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

interface Analysis {
  ldJson: unknown[];
  ldJsonErrors: string[];
  unexpectedInline: string[];
  markerInCode: string[];
}

function analyse(html: string): Analysis {
  const scripts = scanScripts(html);
  const known = new Set([CURRENCY_BOOTSTRAP_SCRIPT]);
  const ga = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (ga) known.add(googleTagBootstrap(ga));
  const result: Analysis = { ldJson: [], ldJsonErrors: [], unexpectedInline: [], markerInCode: [] };
  for (const s of scripts) {
    if ((s.attrs.type ?? "").toLowerCase() === "application/ld+json") {
      try {
        result.ldJson.push(JSON.parse(s.body));
      } catch (error) {
        result.ldJsonErrors.push(`${(error as Error).message} in: ${s.body.slice(0, 160)}`);
      }
      continue;
    }
    if (!isExecutable(s)) continue;
    if (s.attrs.src !== undefined) {
      if (s.body.includes(MARKER)) result.markerInCode.push(`src script body: ${s.body.slice(0, 120)}`);
      continue;
    }
    if (known.has(s.body) || RUNTIME.some((re) => re.test(s.body))) {
      if (s.body.includes(MARKER)) result.markerInCode.push(`runtime script: ${s.body.slice(0, 120)}`);
      continue;
    }
    if (flightArg(s.body) !== undefined) continue; // marker, if present, is JSON string data
    result.unexpectedInline.push(s.body.slice(0, 160));
    if (s.body.includes(MARKER)) result.markerInCode.push(`inline script: ${s.body.slice(0, 160)}`);
  }
  return result;
}

/* ------------------------------------------------------------- fixtures */

const RUN = runId();
const slug = (s: string) => `zz-sec-${RUN}-luna-${s}`;

function fixtureInput(i: number) {
  const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest } = activities[i];
  return { ...rest, secondaryCategorySlugs: [], relatedSlugs: [], collectionSlugs: [], attractionSlug: undefined };
}

type Input = ReturnType<typeof fixtureInput>;

const CAT_EVIL = {
  slug: slug("cat"),
  name: `Luna ${P2}`,
  shortName: "Luna evil",
  tagline: P1,
  intro: P3,
  faqs: [{ q: `Q ${P1}`, a: `A ${P2} ${P4}` }],
};
const CAT_PLAIN = {
  slug: slug("plain-cat"),
  name: "Luna plain category",
  shortName: "Luna plain",
  tagline: "An ordinary category",
  intro: "Nothing unusual here — just text & numbers like 3 > 2.",
  faqs: [{ q: "Is this ordinary?", a: "Yes, it's an \"ordinary\" FAQ." }],
};

const A_EVIL: Input = {
  ...fixtureInput(0),
  slug: slug("act"),
  title: `Luna ${P1}`,
  subtitle: `Sub ${P2}`,
  categorySlug: CAT_EVIL.slug,
  faqs: [{ q: `Q ${P3}`, a: `A ${P4}` }],
};
const A_PLAIN: Input = { ...fixtureInput(1), slug: slug("plain-act"), categorySlug: CAT_PLAIN.slug };
const A_EDITED_BEFORE: Input = { ...fixtureInput(2), slug: slug("edited"), categorySlug: CAT_PLAIN.slug };
const A_EDITED_AFTER: Input = { ...A_EDITED_BEFORE, title: `Edited ${P2}` };

// Landing pages list catalogue titles in an ItemList. Their activity slugs are
// fixed in code, so this edits a seeded listing (restored in afterAll).
const LANDING = landingBySlug("dubai-activities-for-indians")!;
const SEEDED_SLUG = LANDING.activitySlugs[0];
const SEEDED_TITLE = `Seeded ${P1}`;

async function fetchPage(path: string, mustContain: string): Promise<string> {
  // The server's catalogue snapshot is cached (tag "catalog", 60s) and this
  // process cannot revalidate it, so wait out at most one window.
  const deadline = Date.now() + 150_000;
  let last = "";
  while (Date.now() < deadline) {
    const res = await fetch(new URL(path, BASE));
    const html = await res.text();
    if (res.status === 200 && html.includes(mustContain)) return html;
    last = `${res.status}`;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`${path} never rendered the fixture (last status ${last})`);
}

/* ---------------------------------------------------------------- tests */

describe.skipIf(!BASE)("JSON-LD render on real storefront pages (F01/H01)", () => {
  let prisma: typeof import("@/server/lib/db").prisma;
  let admin: StaffFixture;
  let content: StaffFixture;
  let editedId = "";
  let editResult: { status: number; body: { status?: string; version?: number; title?: string } } = { status: 0, body: {} };
  let seeded: { id: string; original: Record<string, unknown>; version: number } | null = null;
  let one: typeof import("@/app/api/admin/activities/[id]/route");

  beforeAll(async () => {
    assertDisposableDb();
    ({ prisma } = await import("@/server/lib/db"));
    admin = await createStaff(RUN, "luna-admin", ["admin"]);
    content = await createStaff(RUN, "luna-content", ["content"]);

    const cats = await import("@/app/api/admin/categories/route");
    const acts = await import("@/app/api/admin/activities/route");
    one = await import("@/app/api/admin/activities/[id]/route");

    // Categories: created by the content role (categories.edit). They are
    // published on create — see the report.
    for (const category of [CAT_EVIL, CAT_PLAIN]) {
      const res = await cats.POST(apiRequest("/api/admin/categories", { body: { category }, cookie: content.cookie }), params({}));
      expect(res.status, await res.clone().text()).toBe(201);
    }
    // Activities: created and published by an admin.
    for (const activity of [A_EVIL, A_PLAIN, A_EDITED_BEFORE]) {
      const res = await acts.POST(apiRequest("/api/admin/activities", { body: { activity, status: "published" }, cookie: admin.cookie }), params({}));
      expect(res.status, await res.clone().text()).toBe(201);
      if (activity === A_EDITED_BEFORE) editedId = ((await res.json()) as { id: string }).id;
    }
    // Content role edits the already-published listing.
    const res = await one.PATCH(
      apiRequest(`/api/admin/activities/${editedId}`, { method: "PATCH", body: { activity: A_EDITED_AFTER, expectedVersion: 1 }, cookie: content.cookie }),
      params({ id: editedId }),
    );
    editResult = { status: res.status, body: (await res.json()) as typeof editResult.body };

    // Content role retitles a seeded, published listing that a landing page shows.
    const seededRow = await prisma.product.findUniqueOrThrow({ where: { slug: SEEDED_SLUG }, select: { id: true } });
    const detail = await one.GET(apiRequest(`/api/admin/activities/${seededRow.id}`, { cookie: content.cookie }), params({ id: seededRow.id }));
    expect(detail.status).toBe(200);
    const { content: doc, version } = (await detail.json()) as { content: Record<string, unknown>; version: number };
    const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...original } = doc;
    const edit = await one.PATCH(
      apiRequest(`/api/admin/activities/${seededRow.id}`, { method: "PATCH", body: { activity: { ...original, title: SEEDED_TITLE }, expectedVersion: version }, cookie: content.cookie }),
      params({ id: seededRow.id }),
    );
    expect(edit.status, await edit.clone().text()).toBe(200);
    seeded = { id: seededRow.id, original, version: version + 1 };

    if (KEEP) {
      console.info(`[json-ld-render] kept fixtures for run ${RUN}:`);
      for (const p of [`/activities/${A_EVIL.slug}`, `/activities/${A_PLAIN.slug}`, `/activities/${A_EDITED_BEFORE.slug}`, `/categories/${CAT_EVIL.slug}`, `/categories/${CAT_PLAIN.slug}`]) console.info(`  ${BASE}${p}`);
    }
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    // The seeded listing is restored even with KEEP: it is shared seed data.
    if (seeded && one) {
      const res = await one.PATCH(
        apiRequest(`/api/admin/activities/${seeded.id}`, { method: "PATCH", body: { activity: seeded.original, expectedVersion: seeded.version, reason: "restore after json-ld render test" }, cookie: admin.cookie }),
        params({ id: seeded.id }),
      );
      if (res.status !== 200) console.error(`[json-ld-render] could not restore ${SEEDED_SLUG}: ${res.status} ${await res.text()}`);
    }
    if (!KEEP) {
      const prefix = `zz-sec-${RUN}-luna-`;
      await prisma.productSupplierMapping.deleteMany({ where: { product: { slug: { startsWith: prefix } } } });
      await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.category.deleteMany({ where: { slug: { startsWith: prefix } } });
      await cleanupPeople(RUN);
    }
    await prisma.$disconnect();
  });

  it("content role edit of a published activity is accepted and the listing stays published", async () => {
    expect(editResult.status).toBe(200);
    expect(editResult.body.status).toBe("published");
    expect(editResult.body.version).toBe(2);
    expect(editResult.body.title).toBe(A_EDITED_AFTER.title);
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: CAT_EVIL.slug } });
    expect(cat.status).toBe("published");
  });

  function assertContained(html: string) {
    const a = analyse(html);
    expect(a.markerInCode, "marker reached executable code").toEqual([]);
    expect(a.unexpectedInline, "inline scripts the page does not normally have").toEqual([]);
    expect(a.ldJsonErrors, "ld+json bodies that do not parse").toEqual([]);
    expect(a.ldJson).toHaveLength(1);
    return a.ldJson[0] as { "@graph"?: Record<string, unknown>[] };
  }

  function graphNode(doc: { "@graph"?: Record<string, unknown>[] }, type: string) {
    const node = doc["@graph"]?.find((n) => n["@type"] === type);
    expect(node, `${type} node`).toBeDefined();
    return node as Record<string, unknown>;
  }

  it("malicious activity: Product, FAQ and breadcrumbs recover the stored strings; nothing executes", async () => {
    const html = await fetchPage(`/activities/${A_EVIL.slug}`, A_EVIL.slug);
    const doc = assertContained(html);
    const product = graphNode(doc, "Product");
    expect(product.name).toBe(A_EVIL.title);
    expect(product.description).toBe(A_EVIL.subtitle);
    expect(graphNode(doc, "FAQPage").mainEntity).toEqual([{ "@type": "Question", name: A_EVIL.faqs[0].q, acceptedAnswer: { "@type": "Answer", text: A_EVIL.faqs[0].a } }]);
    const crumbs = graphNode(doc, "BreadcrumbList").itemListElement as { name: string }[];
    expect(crumbs.map((c) => c.name)).toEqual(["Dubai", CAT_EVIL.name, A_EVIL.title]);
  }, 180_000);

  it("malicious category: FAQ and breadcrumb recover the stored strings; nothing executes", async () => {
    const html = await fetchPage(`/categories/${CAT_EVIL.slug}`, CAT_EVIL.slug);
    const doc = assertContained(html);
    expect(graphNode(doc, "FAQPage").mainEntity).toEqual([{ "@type": "Question", name: CAT_EVIL.faqs[0].q, acceptedAnswer: { "@type": "Answer", text: CAT_EVIL.faqs[0].a } }]);
    const crumbs = graphNode(doc, "BreadcrumbList").itemListElement as { name: string }[];
    expect(crumbs.map((c) => c.name)).toEqual(["Dubai", CAT_EVIL.name]);
  }, 180_000);

  it("content-edited published activity renders the new title as data only", async () => {
    const html = await fetchPage(`/activities/${A_EDITED_BEFORE.slug}`, MARKER);
    const doc = assertContained(html);
    expect(graphNode(doc, "Product").name).toBe(A_EDITED_AFTER.title);
  }, 180_000);

  it("landing page ItemList carries a retitled seeded listing as data only", async () => {
    const html = await fetchPage(`/${LANDING.slug}`, MARKER);
    const doc = assertContained(html);
    const items = graphNode(doc, "ItemList").itemListElement as { url: string; name: string }[];
    expect(items.find((i) => i.url.endsWith(`/activities/${SEEDED_SLUG}`))?.name).toBe(SEEDED_TITLE);
  }, 180_000);

  it("ordinary activity: structured data is unchanged in shape and content", async () => {
    const html = await fetchPage(`/activities/${A_PLAIN.slug}`, A_PLAIN.slug);
    const doc = assertContained(html);
    expect(doc).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Product",
          name: A_PLAIN.title,
          description: A_PLAIN.subtitle,
          brand: { "@type": "Brand", name: "OUTLYY" },
          offers: { "@type": "Offer", price: A_PLAIN.price.adult.inr, priceCurrency: "INR", availability: "https://schema.org/InStock", url: `https://outlyy.com/activities/${A_PLAIN.slug}` },
        },
        ...(A_PLAIN.faqs.length
          ? [{ "@type": "FAQPage", mainEntity: A_PLAIN.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }]
          : []),
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Dubai", item: "https://outlyy.com/" },
            { "@type": "ListItem", position: 2, name: CAT_PLAIN.name, item: `https://outlyy.com/categories/${CAT_PLAIN.slug}` },
            { "@type": "ListItem", position: 3, name: A_PLAIN.title },
          ],
        },
      ],
    });
  }, 180_000);

  it("ordinary category: structured data is unchanged in shape and content", async () => {
    const html = await fetchPage(`/categories/${CAT_PLAIN.slug}`, CAT_PLAIN.slug);
    const doc = assertContained(html);
    expect(doc).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "FAQPage", mainEntity: CAT_PLAIN.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
        { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Dubai", item: "https://outlyy.com/" }, { "@type": "ListItem", position: 2, name: CAT_PLAIN.name }] },
      ],
    });
  }, 180_000);
});

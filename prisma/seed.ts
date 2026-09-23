/* eslint-disable no-console */
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import { activities } from "../src/lib/data/activities";
import { combos } from "../src/lib/data/combos";
import { categories } from "../src/lib/data/categories";
import { activitySchema, projectActivity } from "../src/server/schemas/activity.schema";
import { PERMISSIONS, ROLE_CODES, ROLE_NAMES, ROLE_PERMISSIONS } from "../src/server/lib/permissions";
import { uuidv7 } from "../src/server/lib/ids";

/**
 * Seed — idempotent. Run with `npm run db:seed` (loads .env.local).
 *
 *  1. Roles + permissions (docs/backend/09-agent-console.md §4)
 *  2. Bootstrap admin from ADMIN_BOOTSTRAP_EMAIL (§18 §1.2). Password from
 *     ADMIN_BOOTSTRAP_PASSWORD or generated and printed ONCE. MFA is enrolled
 *     on first login — no permission is usable before that.
 *  3. Suppliers, categories, products and combos from the hand-checked
 *     fixtures in src/lib/data (§10.2.4). Full activity content is written
 *     only when a product has no version history yet — admin edits are
 *     never overwritten by a re-seed.
 *  4. Settings (SLA, routing, follow-up, pricing tolerance) from env defaults.
 *  5. Feature flags.
 */

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const N = 1 << 15;
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, 64, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
  return `scrypt$${N}$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function randomPassword(length = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

const int = (v: string | undefined, def: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : def;
};

async function seedRoles() {
  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { code },
      create: { id: uuidv7(), code, name: ROLE_NAMES[code] },
      update: { name: ROLE_NAMES[code] },
    });
    const wanted = new Set(ROLE_PERMISSIONS[code]);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permission: { notIn: [...wanted] } } });
    await prisma.rolePermission.createMany({
      data: [...wanted].map((permission) => ({ roleId: role.id, permission })),
      skipDuplicates: true,
    });
  }
  const unknown = await prisma.rolePermission.findMany({ where: { permission: { notIn: [...PERMISSIONS] } } });
  if (unknown.length) console.warn(`  ! ${unknown.length} permission rows not in the matrix — review`);
  console.log(`  roles: ${ROLE_CODES.length} upserted`);
}

async function seedBootstrapAdmin() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
  if (!email) {
    console.warn("  ! ADMIN_BOOTSTRAP_EMAIL not set — no admin created. Set it and re-run `npm run db:seed`.");
    return;
  }
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`  admin: ${email} already exists (unchanged)`);
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
  // Trim once and decide from the trimmed value: a whitespace-only env value
  // must behave exactly like an unset one (generate AND print), or the admin
  // is created with a password nobody knows.
  const providedPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim() || undefined;
  const password = providedPassword ?? randomPassword();
  const id = uuidv7();
  await prisma.adminUser.create({
    data: {
      id,
      email,
      fullName: process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "OUTLYY Admin",
      passwordHash: hashPassword(password),
      whatsappDisplayName: (process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "OUTLYY").split(" ")[0],
      roles: { create: [{ roleId: role.id }] },
      availability: { create: { shift: "IST", languages: ["English", "Hindi"], skills: ["premium"], title: "Founder", status: "available" } },
    },
  });
  console.log(`  admin: created ${email}`);
  // Never echo a password that came from the environment (production seeds
  // run with ADMIN_BOOTSTRAP_PASSWORD set and their logs are retained).
  if (!providedPassword) {
    console.log(`\n  ┌──────────────────────────────────────────────────────────┐`);
    console.log(`  │ ONE-TIME BOOTSTRAP PASSWORD (change it after first login) │`);
    console.log(`  │ ${password.padEnd(56)} │`);
    console.log(`  └──────────────────────────────────────────────────────────┘\n`);
  }
}

async function seedCatalogue() {
  const supplierIds = new Map<string, string>();
  const suppliers = new Map<string, (typeof activities)[number]["supplier"]>();
  for (const a of activities) suppliers.set(a.supplier.id, a.supplier);
  for (const s of suppliers.values()) {
    const code = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const row = await prisma.supplier.upsert({
      where: { code },
      create: {
        id: uuidv7(),
        code,
        name: s.name,
        source: s.source === "direct" ? "direct" : s.source === "portal" ? "portal" : "api",
        // Only Rathin gets the API adapter and it is NOT READY (§16) — everything else is manual.
        adapter: "manual",
        capabilities: { availability: false, booking: false, cancellation: false, lookup: false },
        reliabilityScore: s.reliability,
      },
      update: { name: s.name, reliabilityScore: s.reliability },
    });
    supplierIds.set(s.id, row.id);
  }

  let cats = 0;
  for (const [i, c] of categories.entries()) {
    const exists = await prisma.category.findUnique({ where: { slug: c.slug }, select: { id: true } });
    if (exists) continue;
    await prisma.category.create({
      data: {
        id: uuidv7(),
        slug: c.slug,
        name: c.name,
        shortName: c.shortName,
        emoji: c.emoji,
        tagline: c.tagline,
        intro: c.intro,
        heroImage: c.heroImage,
        faqs: c.faqs as unknown as Prisma.InputJsonValue,
        relatedSlugs: c.relatedSlugs,
        featuredSlugs: c.featuredSlugs,
        sortOrder: (i + 1) * 10,
      },
    });
    cats++;
  }

  let created = 0;
  let contentWritten = 0;
  for (const a of activities) {
    const content = activitySchema.parse(a);
    const projection = projectActivity(content);
    const existing = await prisma.product.findUnique({ where: { slug: a.slug }, select: { id: true, version: true, _count: { select: { versions: true } } } });
    let row: { id: string };
    if (!existing) {
      row = await prisma.product.create({
        data: {
          id: uuidv7(),
          slug: a.slug,
          ...projection,
          content,
          fulfilmentMode: a.fulfilmentMode,
          status: "published",
          publishedAt: new Date(),
          version: 1,
        },
        select: { id: true },
      });
      await prisma.productVersion.create({ data: { id: uuidv7(), productId: row.id, version: 1, content, status: "published", reason: "seed" } });
      contentWritten++;
    } else if (existing._count.versions === 0) {
      // Pre-content row (identity only): fill the document once, keep fulfilment_mode.
      row = await prisma.product.update({
        where: { slug: a.slug },
        data: { ...projection, content, version: 1, publishedAt: new Date() },
        select: { id: true },
      });
      await prisma.productVersion.create({ data: { id: uuidv7(), productId: row.id, version: 1, content, status: "published", reason: "seed" } });
      contentWritten++;
    } else {
      // Admin-owned now: never overwrite content, status or fulfilment_mode.
      row = existing;
    }
    const supplierId = supplierIds.get(a.supplier.id);
    if (supplierId) {
      // The unique (product_id, supplier_id, variant_code) never matches a NULL
      // variant_code (SQL NULL semantics), so an upsert cannot be used here.
      // Look first, create only when absent — idempotent across re-runs.
      const exists = await prisma.productSupplierMapping.findFirst({ where: { productId: row.id, supplierId, variantCode: null }, select: { id: true } });
      if (!exists) await prisma.productSupplierMapping.create({ data: { id: uuidv7(), productId: row.id, supplierId, priority: 1, externalRef: {} } });
    }
    created++;
  }
  for (const c of combos) {
    await prisma.combo.upsert({
      where: { slug: c.slug },
      create: { id: uuidv7(), slug: c.slug, name: c.name, tier: c.tier, confirmation: c.confirmation, fulfilmentMode: c.fulfilmentMode },
      update: { name: c.name, tier: c.tier, confirmation: c.confirmation },
    });
  }
  console.log(`  catalogue: ${suppliers.size} suppliers, ${cats} new categories, ${created} products (${contentWritten} content docs written), ${combos.length} combos`);
}

async function seedSettings() {
  const e = process.env;
  const ladder = (e.FOLLOWUP_LADDER_HOURS ?? "2,24,72,168").split(",").map(Number).filter((n) => n > 0);
  const defaults: Record<string, unknown> = {
    sla: {
      responseMinutes: int(e.SLA_INQUIRY_RESPONSE_MINUTES, 30),
      businessStart: e.SLA_BUSINESS_HOURS_START ?? "09:00",
      businessEnd: e.SLA_BUSINESS_HOURS_END ?? "23:00",
      timeZone: e.SLA_TIMEZONE ?? "Asia/Kolkata",
      escalationMinutes: int(e.SLA_ESCALATION_MINUTES, 30),
    },
    routing: {
      premiumThresholdInr: int(e.ROUTING_PREMIUM_THRESHOLD_INR, 100000),
      groupThresholdPax: int(e.ROUTING_GROUP_THRESHOLD_PAX, 5),
      maxConcurrentDefault: int(e.AGENT_MAX_CONCURRENT_INQUIRIES, 15),
    },
    followup: {
      ladderHours: ladder.length > 3 ? ladder.slice(0, -1) : ladder,
      autoLostAfterHours: ladder.length > 3 ? ladder[ladder.length - 1] : 168,
    },
    pricing: { tolerancePercent: int(e.PRICE_TOLERANCE_PERCENT, 5) },
  };
  for (const [key, value] of Object.entries(defaults)) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (!existing) await prisma.setting.create({ data: { key, value: value as object } });
  }
  for (const [key, enabled] of [
    ["design_system_page", e.FEATURE_DESIGN_SYSTEM_PAGE === "true"],
    ["maintenance_mode", false],
    ["response_promise", true],
  ] as const) {
    await prisma.featureFlag.upsert({ where: { key }, create: { key, enabled, rolloutPct: enabled ? 100 : 0 }, update: {} });
  }
  console.log("  settings + flags: seeded (existing values untouched)");
}

async function main() {
  console.log("Seeding OUTLYY…");
  await seedRoles();
  await seedBootstrapAdmin();
  await seedCatalogue();
  await seedSettings();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Publish the draft catalogue — every draft activity and the categories they
 * need — writing the same trail the admin console writes.
 *
 * This is the scripted equivalent of `activityService.bulkSetStatus` and
 * `bulkSetCategoryStatus`. Those live behind `server-only` and need an Actor,
 * so they cannot be imported here; what matters is that the *effects* match,
 * because a row published without a version row has no history to restore and
 * no audit entry to answer "who put this live".
 *
 * For each activity: status -> published, version + 1, a `product_versions`
 * row carrying the content at that version, and an `audit_logs` row.
 * Categories get the status change and an audit row (they are not versioned).
 *
 * A listing whose `content` does not parse is skipped and reported rather
 * than published half-formed.
 *
 * Usage: node --env-file=.env.local scripts/publish-catalogue.mjs [--apply]
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const REASON = "Catalogue go-live";

/** uuidv7-ish: time-ordered, so version rows sort by creation like the app's ids. */
function uuidv7() {
  const ms = Date.now();
  const hex = ms.toString(16).padStart(12, "0");
  const rest = randomUUID().replace(/-/g, "").slice(12);
  const raw = `${hex}7${rest.slice(1)}`;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
}

/** The actor recorded in the audit trail. Not a human — say so plainly. */
const ACTOR = { type: "system", id: null };

const [drafts, draftCategories] = await Promise.all([
  prisma.product.findMany({
    where: { deletedAt: null, status: "draft" },
    select: { id: true, slug: true, title: true, version: true, content: true, publishedAt: true, categorySlug: true },
    orderBy: { slug: "asc" },
  }),
  prisma.category.findMany({ where: { deletedAt: null, status: { not: "published" } }, select: { id: true, slug: true, status: true } }),
]);

const usable = drafts.filter((d) => d.content && typeof d.content === "object");
const unusable = drafts.filter((d) => !usable.includes(d));

console.log(`draft activities   : ${drafts.length}`);
console.log(`  publishable      : ${usable.length}`);
console.log(`  skipped (content): ${unusable.length}${unusable.length ? ` -> ${unusable.map((u) => u.slug).join(", ")}` : ""}`);
console.log(`draft categories   : ${draftCategories.length}${draftCategories.length ? ` -> ${draftCategories.map((c) => c.slug).join(", ")}` : ""}`);

const byCategory = {};
for (const d of usable) byCategory[d.categorySlug] = (byCategory[d.categorySlug] ?? 0) + 1;
console.log(`per category       :`, byCategory);

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to publish.");
  await prisma.$disconnect();
  process.exit(0);
}

const now = new Date();

const result = await prisma.$transaction(
  async (tx) => {
    // Categories first: a published activity in a draft category has no
    // category page to sit on.
    if (draftCategories.length) {
      await tx.category.updateMany({ where: { id: { in: draftCategories.map((c) => c.id) } }, data: { status: "published" } });
      await tx.auditLog.createMany({
        data: draftCategories.map((c) => ({
          actorType: ACTOR.type,
          actorId: ACTOR.id,
          action: "category.status",
          entityType: "category",
          entityId: c.id,
          before: { status: c.status },
          after: { status: "published", bulk: true },
          reason: REASON,
        })),
      });
    }

    const ids = usable.map((d) => d.id);
    await tx.product.updateMany({ where: { id: { in: ids } }, data: { status: "published", version: { increment: 1 } } });
    await tx.product.updateMany({ where: { id: { in: ids }, publishedAt: null }, data: { publishedAt: now } });

    await tx.productVersion.createMany({
      data: usable.map((d) => ({
        id: uuidv7(),
        productId: d.id,
        version: d.version + 1,
        content: d.content,
        status: "published",
        actorId: ACTOR.id,
        reason: REASON,
      })),
    });

    await tx.auditLog.createMany({
      data: usable.map((d) => ({
        actorType: ACTOR.type,
        actorId: ACTOR.id,
        action: "activity.publish",
        entityType: "product",
        entityId: d.id,
        before: { status: "draft", version: d.version },
        after: { status: "published", version: d.version + 1, bulk: true },
        reason: REASON,
      })),
    });

    return { activities: usable.length, categories: draftCategories.length };
  },
  { maxWait: 15_000, timeout: 120_000 },
);

console.log(`\npublished ${result.activities} activities and ${result.categories} categories.`);

const after = await prisma.product.groupBy({ by: ["status"], _count: true, where: { deletedAt: null } });
console.log("now:", after);

await prisma.$disconnect();

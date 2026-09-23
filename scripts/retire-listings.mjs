/* eslint-disable no-console */
/**
 * Retire every currently published activity (soft delete) so a fresh
 * catalogue can be imported. Reversible: each listing keeps its history and
 * can be restored from /admin/activities?status=deleted.
 *
 *   node --env-file=.env.local scripts/retire-listings.mjs            # dry run
 *   node --env-file=.env.local scripts/retire-listings.mjs --apply    # do it
 *   ... --apply --only-seeded   # only the 28 fixture-seeded listings (default)
 *   ... --apply --all           # every live listing, imported ones too
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");

function uuidv7() {
  const ts = BigInt(Date.now());
  const b = randomBytes(16);
  b[0] = Number((ts >> 40n) & 0xffn); b[1] = Number((ts >> 32n) & 0xffn); b[2] = Number((ts >> 24n) & 0xffn);
  b[3] = Number((ts >> 16n) & 0xffn); b[4] = Number((ts >> 8n) & 0xffn); b[5] = Number(ts & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const live = await prisma.product.findMany({
  where: { deletedAt: null, status: { not: "archived" } },
  select: { id: true, slug: true, title: true, status: true, version: true, content: true, versions: { where: { version: 1 }, select: { reason: true } } },
  orderBy: { slug: "asc" },
});
const targets = all ? live : live.filter((p) => p.versions[0]?.reason === "seed");
console.log(`${live.length} live listings; ${targets.length} selected (${all ? "all" : "seeded only"})`);
for (const p of targets) console.log(`  ${p.status.padEnd(9)} v${p.version}  ${p.slug}`);
if (!apply) {
  console.log("\nDry run — add --apply to retire them.");
  await prisma.$disconnect();
  process.exit(0);
}

const reason = `Retired for catalogue re-import (${new Date().toISOString().slice(0, 10)})`;
const now = new Date();
await prisma.$transaction(async (tx) => {
  for (const p of targets) {
    const version = p.version + 1;
    await tx.product.update({ where: { id: p.id }, data: { deletedAt: now, status: "archived", version } });
    await tx.productVersion.create({ data: { id: uuidv7(), productId: p.id, version, content: p.content, status: "archived", reason } });
    await tx.auditLog.create({ data: { actorType: "system", action: "activity.delete", entityType: "product", entityId: p.id, before: { status: p.status, deletedAt: null }, after: { status: "archived", deletedAt: now.toISOString() }, reason } });
  }
}, { maxWait: 15_000, timeout: 300_000 });
console.log(`\nRetired ${targets.length} listings. Storefront will show the remaining published ones (none, if that was all of them) within 60 s.`);
await prisma.$disconnect();

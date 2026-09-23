/* eslint-disable no-console */
// Removes rows left behind by an interrupted service test run (slug prefix zz-test-).
// Usage: node --env-file=.env.local scripts/purge-test-rows.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
await prisma.productSupplierMapping.deleteMany({ where: { product: { slug: { startsWith: "zz-test-" } } } });
const p = await prisma.product.deleteMany({ where: { slug: { startsWith: "zz-test-" } } });
const c = await prisma.category.deleteMany({ where: { slug: { startsWith: "zz-test-" } } });
console.log(`purged ${p.count} products, ${c.count} categories`);
await prisma.$disconnect();

/**
 * Bring the stored `settings.sla` row in line with the published opening
 * hours. The row overrides the env defaults, so changing SLA_* alone leaves
 * the old 09:00–23:00 Asia/Kolkata window in force — which is how the site
 * came to promise a 30-minute reply at 10pm on a Sunday.
 *
 * Run: node --env-file=.env.local scripts/sync-sla-settings.mjs [--apply]
 */
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

const next = {
  responseMinutes: Number(process.env.SLA_INQUIRY_RESPONSE_MINUTES ?? 30),
  businessStart: process.env.SLA_BUSINESS_HOURS_START ?? "10:00",
  businessEnd: process.env.SLA_BUSINESS_HOURS_END ?? "18:00",
  businessDays: (process.env.SLA_BUSINESS_DAYS ?? "1,2,3,4,5,6")
    .split(",")
    .map((d) => Number.parseInt(d.trim(), 10))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  timeZone: process.env.SLA_TIMEZONE ?? "Asia/Dubai",
  escalationMinutes: Number(process.env.SLA_ESCALATION_MINUTES ?? 30),
};

const current = await prisma.setting.findUnique({ where: { key: "sla" } });
console.log("current:", JSON.stringify(current?.value ?? null));
console.log("next:   ", JSON.stringify(next));

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write it.");
} else {
  await prisma.setting.upsert({
    where: { key: "sla" },
    create: { key: "sla", value: next },
    update: { value: next },
  });
  console.log("\nWritten.");
}

await prisma.$disconnect();

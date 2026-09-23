import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "./db";
import type { Actor } from "./actor";
import { log } from "./logger";

/**
 * AC-ADM-01: every admin/agent mutation is audited with actor, timestamp,
 * before and after. Rows are immutable at the database level (trigger in the
 * init migration). Callers pass the transaction when the mutation is
 * transactional so the audit row commits with the change.
 */

const STRIP = new Set([
  "passwordHash",
  "password_hash",
  "password",
  "temporaryPassword",
  "totpSecretEncrypted",
  "totp_secret_encrypted",
  "totpSecret",
  "secret",
  "otpauthUri",
  "refreshHash",
  "token",
]);

function scrub(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v) => {
      if (STRIP.has(k)) return "[stripped]";
      if (typeof v === "bigint") return v.toString();
      return v;
    }),
  ) as Prisma.InputJsonValue;
}

export async function audit(
  actor: Actor,
  action: string,
  entity: { type: string; id: string },
  change: { before?: unknown; after?: unknown; reason?: string } = {},
  tx: Tx | typeof prisma = prisma,
): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        actorType: actor.type,
        actorId: actor.id,
        action,
        entityType: entity.type,
        entityId: entity.id,
        before: scrub(change.before),
        after: scrub(change.after),
        reason: change.reason,
        ipHash: actor.ipHash,
        userAgent: actor.userAgent,
      },
    });
  } catch (error) {
    // An audit failure inside a transaction rolls the mutation back (correct);
    // outside one it must still be visible.
    log.error("audit.write_failed", { action, entity, error });
    throw error;
  }
}

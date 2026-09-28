import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { log } from "./logger";
import { Errors } from "./errors";

/**
 * Run an operation at most once per key, replaying the first result afterwards.
 *
 * The storefront's real problem is not malice, it is a double tap on a slow
 * connection: the customer presses "Send inquiry", nothing visibly happens for
 * two seconds, they press again, and two identical inquiries reach two
 * different agents. The client sends one key per form instance, so both
 * requests collide here and the second is answered with the first one's result.
 *
 * Reserve-then-run, not run-then-record. The row is created *before* the work
 * starts, so the second request loses the race while the first is still in
 * flight rather than duplicating it. Three outcomes on collision:
 *
 *   completed  → replay `responseBody`, which is what a double tap gets
 *   in flight  → 409, because we do not yet know what the answer will be
 *   failed     → the row is deleted, so an honest retry is allowed
 *
 * Keys are namespaced by `scope` and by the caller's identity, never by the
 * client's value alone — otherwise one customer could guess another's key and
 * be handed their inquiry reference.
 */

const IN_FLIGHT_GRACE_MS = 60_000;

export interface OnceResult<T> {
  value: T;
  /** True when this call did the work; false when a previous one did. */
  fresh: boolean;
}

export async function runOnce<T>(opts: {
  /** Already namespaced by scope and caller identity. */
  key: string;
  scope: string;
  ttlMs: number;
  run: () => Promise<T>;
}): Promise<OnceResult<T>> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + opts.ttlMs);

  try {
    await prisma.idempotencyKey.create({
      data: { key: opts.key, scope: opts.scope, requestHash: "", lockedAt: now, expiresAt },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;

    const existing = await prisma.idempotencyKey.findUnique({ where: { key: opts.key } });
    if (existing?.completedAt && existing.responseBody !== null) {
      log.info("idempotency.replayed", { scope: opts.scope });
      return { value: existing.responseBody as T, fresh: false };
    }
    // Still running, or crashed so recently that a retry would probably race it
    // again. Better a retryable 409 than a second inquiry.
    if (existing && existing.lockedAt && now.getTime() - existing.lockedAt.getTime() < IN_FLIGHT_GRACE_MS) {
      throw Errors.conflict("That was already being sent. Give it a moment.");
    }
    await prisma.idempotencyKey.delete({ where: { key: opts.key } }).catch(() => {});
    return runOnce(opts);
  }

  try {
    const value = await opts.run();
    await prisma.idempotencyKey.update({
      where: { key: opts.key },
      data: { completedAt: new Date(), responseStatus: 201, responseBody: value as Prisma.InputJsonValue },
    });
    return { value, fresh: true };
  } catch (error) {
    // A failure must not poison the key: the customer fixes the problem and
    // presses send again with the same form instance.
    await prisma.idempotencyKey.delete({ where: { key: opts.key } }).catch(() => {});
    throw error;
  }
}

/** Housekeeping — safe to call fire-and-forget after a successful run. */
export function sweepExpiredKeys(scope: string): void {
  void prisma.idempotencyKey.deleteMany({ where: { scope, expiresAt: { lt: new Date() } } }).catch(() => {});
}

import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * The only module outside `src/server/repositories/**` that imports Prisma
 * (docs/backend/03-tech-stack.md §3.3). Singleton across hot reloads; Neon's
 * pooled connection string (DATABASE_URL) keeps serverless connection counts
 * sane, DIRECT_URL is for migrations only.
 */

const globalForPrisma = globalThis as unknown as { __outlyyPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__outlyyPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__outlyyPrisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Interactive-transaction budget. Prisma's default (5s) assumes a co-located
 * database; the inquiry→order conversion runs ~10 statements in one
 * transaction and must not fail on a slow link. Pass to every
 * `prisma.$transaction(async (tx) => …, TX_OPTIONS)`.
 */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

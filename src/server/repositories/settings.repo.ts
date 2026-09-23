import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

/**
 * `settings` — admin-editable configuration, keyed strings with JSON values
 * (AC-SRCH-05 / §17 §6.4). Cached per process for 60s; a change propagates
 * within a minute across serverless instances without a deploy.
 */

const cache = new Map<string, { value: unknown; at: number }>();
const TTL_MS = 60_000;

export const settingsRepo = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
    const row = await prisma.setting.findUnique({ where: { key } });
    const value = (row?.value as T | undefined) ?? fallback;
    cache.set(key, { value, at: Date.now() });
    return value;
  },

  async set(key: string, value: unknown, updatedBy?: string) {
    const row = await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedBy },
      update: { value: value as Prisma.InputJsonValue, updatedBy },
    });
    cache.set(key, { value: row.value, at: Date.now() });
    return row;
  },

  async all() {
    return prisma.setting.findMany({ orderBy: { key: "asc" } });
  },

  invalidate(key?: string) {
    if (key) cache.delete(key);
    else cache.clear();
  },
};

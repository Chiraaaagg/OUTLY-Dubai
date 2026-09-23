import "server-only";
import { z } from "zod";
import { activityInputSchema, categoryInputSchema, IMPORT_FIELDS, TIERS } from "./activity.schema";

/**
 * Transport schemas for the catalogue admin routes (`/api/admin/activities`,
 * `/api/admin/categories`, `/api/admin/imports`). Content itself is validated
 * by `activityInputSchema`; these only shape the envelope. All `.strict()`.
 */

export const idSchema = z.string().uuid();
const reason = z.string().trim().min(3).max(300);

export const activityListQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(["draft", "published", "archived", "deleted"]).optional(),
    tier: z.enum(TIERS).optional(),
    category: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const createActivitySchema = z
  .object({
    activity: activityInputSchema,
    status: z.enum(["draft", "published"]).optional(),
    reason: reason.optional(),
  })
  .strict();

export const updateActivitySchema = z
  .object({
    activity: activityInputSchema,
    expectedVersion: z.number().int().min(1).optional(),
    reason: reason.optional(),
  })
  .strict();

export const activityStatusSchema = z.object({ status: z.enum(["draft", "published", "archived"]), reason: reason.optional() }).strict();
export const deleteActivitySchema = z.object({ reason }).strict();
export const restoreVersionSchema = z.object({ version: z.number().int().min(1), reason: reason.optional() }).strict();

export const upsertCategorySchema = z.object({ category: categoryInputSchema, reason: reason.optional() }).strict();
export const categoryStatusSchema = z.object({ status: z.enum(["draft", "published", "archived"]), reason: reason.optional() }).strict();
export const deleteCategorySchema = z.object({ reason }).strict();

/* -------------------------------------------------------------- imports */

export const importSourceSchema = z.enum(["csv", "sheet", "doc", "bulk", "manual"]);

/** Column mapping: target field → source header (null = not mapped). */
export const mappingSchema = z.record(z.enum(IMPORT_FIELDS), z.string().trim().max(120).nullable());

const googleUrl = z
  .string()
  .trim()
  .url()
  .max(600)
  .refine((u) => {
    try {
      const { hostname, protocol } = new URL(u);
      return protocol === "https:" && hostname === "docs.google.com";
    } catch {
      return false;
    }
  }, "Only https://docs.google.com links are accepted");

export const importFetchSchema = z.object({ url: googleUrl }).strict();

export const importPreviewSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("csv"), text: z.string().max(5_000_000), fileName: z.string().trim().max(200).optional(), mapping: mappingSchema.optional() }).strict(),
  z.object({ source: z.literal("sheet"), url: googleUrl, mapping: mappingSchema.optional() }).strict(),
  z.object({ source: z.literal("doc"), url: googleUrl.optional(), text: z.string().max(500_000).optional(), mapping: mappingSchema.optional() }).strict(),
  z.object({ source: z.literal("bulk"), items: z.array(z.unknown()).min(1).max(500) }).strict(),
]);

export const importApplySchema = z.object({ partial: z.boolean().optional(), publish: z.boolean().optional(), createMissingCategories: z.boolean().optional(), reason: reason.optional() }).strict();
export const importRevertSchema = z.object({ reason: reason.optional() }).strict();
export const importListQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(1000).optional() }).strict();

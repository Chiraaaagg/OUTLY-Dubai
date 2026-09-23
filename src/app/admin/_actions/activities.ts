"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authService } from "@/server/services/auth.service";
import { activityService, BULK_LIMIT, type ActivityListFilters } from "@/server/services/activity.service";
import { parseWith } from "@/server/lib/http";
import { activityInputSchema, categoryInputSchema } from "@/server/schemas/activity.schema";
import { idSchema } from "@/server/schemas/catalog.schemas";
import { form, runAction, type ActionResult } from "./result";

/**
 * Activity + category management Server Actions. The editor posts the whole
 * `ActivityInput` as one JSON field (`payload`) so the strict schema — not a
 * hand-written FormData mapper — decides what is accepted; per-field errors
 * come back keyed by path (`price.adult.inr`, `faqs.2.a`).
 */

export type SaveActivityResult = ActionResult<{ id: string; slug: string; version: number; status: string }>;
export type ActivityRowResult = ActionResult<{ id: string; slug: string; status: string; version: number; deletedAt: string | null }>;
export type CategoryResult = ActionResult<{ id: string; slug: string }>;
export type BulkResult = ActionResult<{ changed: number; skipped: number; invalid: number; matched: number; remaining: number; status: string }>;

const statusSchema = z.enum(["draft", "published", "archived"]);

/** The subset of the console's filters a "select all matching" bulk action may re-run server-side. */
const bulkFilterSchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(["draft", "published", "archived", "deleted"]).optional(),
    tier: z.string().regex(/^[A-E]$/).optional(),
    category: z.string().max(80).optional(),
  })
  .strict();

function payload(fd: FormData): unknown {
  const raw = form.str(fd, "payload");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _: "invalid" };
  }
}

function json(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _: "invalid" };
  }
}

function touched() {
  revalidatePath("/admin/activities");
  revalidatePath("/admin/products");
}

export async function saveActivityAction(_prev: SaveActivityResult | null, fd: FormData): Promise<SaveActivityResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("products.edit");
    const input = parseWith(activityInputSchema, payload(fd));
    const id = form.str(fd, "id");
    const reason = form.str(fd, "reason");
    if (id) {
      const expectedVersion = form.num(fd, "expectedVersion");
      const row = await activityService.update(actor, parseWith(idSchema, id), input, { reason, expectedVersion });
      touched();
      return { id: row.id, slug: row.slug, version: row.version, status: row.status };
    }
    const status = form.str(fd, "status") === "published" ? "published" : "draft";
    const row = await activityService.create(actor, input, { status, reason });
    touched();
    return { id: row.id, slug: row.slug, version: row.version, status: row.status };
  });
}

export async function setActivityStatusAction(_prev: ActivityRowResult | null, fd: FormData): Promise<ActivityRowResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("products.publish");
    const id = parseWith(idSchema, form.str(fd, "id"));
    const status = parseWith(statusSchema, form.str(fd, "status"));
    const row = await activityService.setStatus(actor, id, status, form.str(fd, "reason"));
    touched();
    return { id: row.id, slug: row.slug, status: row.status, version: row.version, deletedAt: row.deletedAt?.toISOString() ?? null };
  });
}

/**
 * Publish / unpublish / archive many listings in one call.
 *
 * `scope=ids` takes the checked rows; `scope=filter` takes everything matching
 * the filters the console is showing, so "select all 218 drafts" is one click
 * and one transaction instead of 218 round trips.
 */
export async function bulkSetActivityStatusAction(_prev: BulkResult | null, fd: FormData): Promise<BulkResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("products.publish");
    const status = parseWith(statusSchema, form.str(fd, "status"));
    const reason = form.str(fd, "reason");
    const scope = form.str(fd, "scope") === "filter" ? "filter" : "ids";

    let target: { ids?: string[]; filters?: ActivityListFilters };
    if (scope === "filter") {
      target = { filters: parseWith(bulkFilterSchema, json(form.str(fd, "filters"))) };
    } else {
      const ids = fd.getAll("ids").map(String).filter(Boolean);
      target = { ids: parseWith(z.array(idSchema).min(1, "Select at least one activity").max(BULK_LIMIT), ids) };
    }

    const r = await activityService.bulkSetStatus(actor, target, status, reason);
    touched();
    return { ...r, status };
  });
}

export async function bulkSetCategoryStatusAction(_prev: BulkResult | null, fd: FormData): Promise<BulkResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("categories.edit");
    const status = parseWith(statusSchema, form.str(fd, "status"));
    const ids = parseWith(z.array(idSchema).min(1, "Select at least one category").max(BULK_LIMIT), fd.getAll("ids").map(String).filter(Boolean));
    const r = await activityService.bulkSetCategoryStatus(actor, ids, status, form.str(fd, "reason"));
    revalidatePath("/admin/categories");
    touched();
    return { ...r, status };
  });
}

export async function duplicateActivityAction(_prev: ActivityRowResult | null, fd: FormData): Promise<ActivityRowResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("products.edit");
    const id = parseWith(idSchema, form.str(fd, "id"));
    const row = await activityService.duplicate(actor, id);
    touched();
    return { id: row.id, slug: row.slug, status: row.status, version: row.version, deletedAt: null };
  });
}

export async function deleteActivityAction(_prev: ActivityRowResult | null, fd: FormData): Promise<ActivityRowResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("products.delete");
    const id = parseWith(idSchema, form.str(fd, "id"));
    const row = await activityService.remove(actor, id, form.str(fd, "reason") ?? "");
    touched();
    return { id: row.id, slug: row.slug, status: row.status, version: row.version, deletedAt: row.deletedAt?.toISOString() ?? null };
  });
}

export async function restoreActivityAction(_prev: ActivityRowResult | null, fd: FormData): Promise<ActivityRowResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("products.delete");
    const id = parseWith(idSchema, form.str(fd, "id"));
    const row = await activityService.restore(actor, id);
    touched();
    return { id: row.id, slug: row.slug, status: row.status, version: row.version, deletedAt: null };
  });
}

export async function restoreVersionAction(_prev: ActivityRowResult | null, fd: FormData): Promise<ActivityRowResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("products.edit");
    const id = parseWith(idSchema, form.str(fd, "id"));
    const version = parseWith(z.number().int().min(1), form.num(fd, "version"));
    const row = await activityService.restoreVersion(actor, id, version, form.str(fd, "reason"));
    touched();
    revalidatePath(`/admin/activities/${id}`);
    return { id: row.id, slug: row.slug, status: row.status, version: row.version, deletedAt: null };
  });
}

/* ------------------------------------------------------------ categories */

export async function saveCategoryAction(_prev: CategoryResult | null, fd: FormData): Promise<CategoryResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("categories.edit");
    const input = parseWith(categoryInputSchema, payload(fd));
    const row = await activityService.upsertCategory(actor, input, { reason: form.str(fd, "reason") });
    revalidatePath("/admin/categories");
    return { id: row.id, slug: row.slug };
  });
}

export async function setCategoryStatusAction(_prev: CategoryResult | null, fd: FormData): Promise<CategoryResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("categories.edit");
    const id = parseWith(idSchema, form.str(fd, "id"));
    const status = parseWith(statusSchema, form.str(fd, "status"));
    const row = await activityService.setCategoryStatus(actor, id, status, form.str(fd, "reason"));
    revalidatePath("/admin/categories");
    return { id: row.id, slug: row.slug };
  });
}

export async function deleteCategoryAction(_prev: CategoryResult | null, fd: FormData): Promise<CategoryResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("categories.edit");
    const id = parseWith(idSchema, form.str(fd, "id"));
    const row = await activityService.removeCategory(actor, id, form.str(fd, "reason") ?? "");
    revalidatePath("/admin/categories");
    return { id: row.id, slug: row.slug };
  });
}

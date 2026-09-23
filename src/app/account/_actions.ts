"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { customerService } from "@/server/services/customer.service";

/**
 * Server Actions for /account/profile (customer-auth contract §4).
 *
 * Each action re-resolves the session from the cookie via
 * `customerAuthService.requireCookies()` — the client never passes an
 * identity, so there is nothing to spoof. Input is validated here with strict
 * zod before it reaches the service; the service owns permissions and audit.
 * Results are plain data: the form renders them, nothing is thrown across
 * the wire except the redirect to /login when the session is gone.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; fields?: Record<string, string> };

const DIETARY = ["veg", "jain", "halal", "non-veg"] as const;

const profileSchema = z
  .object({
    fullName: z.string().trim().max(120, "Keep the name under 120 characters.").optional(),
    email: z
      .union([z.literal(""), z.string().trim().email("That doesn't look like an email address.")])
      .optional(),
    dietary: z.enum(DIETARY).optional(),
    hotel: z.string().trim().max(200, "Keep this under 200 characters.").optional(),
    preferredCurrency: z.enum(["INR", "AED"]).optional(),
  })
  .strict();

const preferencesSchema = z
  .object({
    whatsappTransactional: z.boolean(),
    whatsappMarketing: z.boolean(),
    email: z.boolean(),
  })
  .strict();

const deletionSchema = z
  .object({
    reason: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
  })
  .strict();

async function session() {
  try {
    return await customerAuthService.requireCookies();
  } catch {
    redirect("/login?next=%2Faccount%2Fprofile");
  }
}

function failure(err: unknown, fallback: string): ActionResult {
  const e = err as { message?: unknown; recovery?: unknown; details?: { fields?: Record<string, string> } };
  const fields = e?.details?.fields;
  const message =
    (typeof e?.recovery === "string" && e.recovery) ||
    (typeof e?.message === "string" && e.message) ||
    fallback;
  return { ok: false, message, fields };
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const s = await session();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  }
  const { fullName, email, dietary, hotel, preferredCurrency } = parsed.data;
  try {
    // Empty strings are "no change" for now; clearing a field is an open request to the
    // backend (see docs/backend/impl/account-ui.md).
    await customerService.updateProfile(s, {
      fullName: fullName || undefined,
      email: email || undefined,
      dietary,
      hotel: hotel || undefined,
      preferredCurrency,
    });
  } catch (err) {
    return failure(err, "We couldn't save your details. Try again in a moment.");
  }
  revalidatePath("/account", "layout");
  return { ok: true };
}

export async function updatePreferencesAction(input: unknown): Promise<ActionResult> {
  const s = await session();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Those preferences didn't look right. Reload and try again." };
  try {
    await customerService.updatePreferences(s, parsed.data);
  } catch (err) {
    return failure(err, "We couldn't save your preferences. Try again in a moment.");
  }
  revalidatePath("/account/profile");
  return { ok: true };
}

export async function requestDeletionAction(input: unknown): Promise<ActionResult> {
  const s = await session();
  const parsed = deletionSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  }
  try {
    await customerService.requestDeletion(s, parsed.data.reason || undefined);
  } catch (err) {
    return failure(err, "We couldn't log the request. Message us on WhatsApp and we'll do it by hand.");
  }
  return { ok: true };
}

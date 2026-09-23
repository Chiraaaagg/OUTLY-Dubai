"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authService } from "@/server/services/auth.service";
import { BULK_ASSIGN_LIMIT, inquiryService } from "@/server/services/inquiry.service";
import { notificationService } from "@/server/services/notification.service";
import type { Actor } from "@/server/lib/actor";
import type { Permission } from "@/server/lib/permissions";
import { LOST_REASONS } from "@/server/domain/inquiry-state";
import type { InquiryStatus } from "@/lib/types";
import { runAction, type ActionResult } from "./result";

/**
 * Inquiry console Server Actions (§19 §4). Each one: validate the payload
 * (zod, strict), resolve the session with the permission the UI already
 * checked, call ONE service method (the service re-checks ownership and
 * permissions), revalidate the queue + detail, and return the shared
 * `ActionResult`. `runAction` turns `AppError` into text; nothing else is
 * ever thrown to the client.
 */

const STATUSES = ["new", "assigned", "contacted", "quoted", "negotiating", "payment_pending", "won", "lost", "spam"] as const;
const id = z.string().min(1).max(64);
const shortText = (max: number) => z.string().trim().max(max).optional();

function paths(inquiryId: string) {
  return ["/admin/inquiries", `/admin/inquiries/${inquiryId}`, "/admin"];
}

async function run<T>(permission: Permission, inquiryId: string, fn: (actor: Actor) => Promise<T>): Promise<ActionResult<T>> {
  const r = await runAction(async () => {
    const { actor } = await authService.requireCookies(permission);
    return fn(actor);
  });
  if (r.ok) for (const p of paths(inquiryId)) revalidatePath(p);
  return r;
}

function invalid<T>(error: z.ZodError): ActionResult<T> {
  const fields: Record<string, string> = {};
  for (const i of error.issues) fields[i.path.join(".") || "form"] = i.message;
  return { ok: false, code: "VALIDATION_FAILED", message: "Some fields need attention", recovery: "Check the highlighted fields and try again.", fields };
}

function fieldError<T>(field: string, message: string): ActionResult<T> {
  return { ok: false, code: "VALIDATION_FAILED", message, fields: { [field]: message } };
}

/* ---------------------------------------------------------------- claim */

export async function claimInquiry(inquiryId: string): Promise<ActionResult<{ status: InquiryStatus }>> {
  const parsed = id.safeParse(inquiryId);
  if (!parsed.success) return invalid(parsed.error);
  return run("inquiries.claim", parsed.data, async (actor) => {
    const d = await inquiryService.claim(actor, parsed.data);
    return { status: d.status };
  });
}

/* --------------------------------------------------------------- assign */

const assignSchema = z.strictObject({ id, agentId: id, reason: shortText(300) });

export async function assignInquiry(input: z.input<typeof assignSchema>): Promise<ActionResult<{ status: InquiryStatus }>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, agentId, reason } = parsed.data;
  return run("inquiries.assign", inquiryId, async (actor) => {
    const d = await inquiryService.assign(actor, inquiryId, agentId, reason || undefined);
    return { status: d.status };
  });
}

/** Bulk assign from the queue. The service requires `inquiries.assign` and validates the target agent. */
const bulkAssignSchema = z.strictObject({ ids: z.array(id).min(1, "Select at least one inquiry").max(BULK_ASSIGN_LIMIT), agentId: id, reason: shortText(300) });

export type BulkAssignResult = ActionResult<{ assigned: number; skipped: number; alreadyTheirs: number; agentName: string }>;

export async function bulkAssignInquiries(_prev: BulkAssignResult | null, fd: FormData): Promise<BulkAssignResult> {
  const parsed = bulkAssignSchema.safeParse({
    ids: fd.getAll("ids").map(String).filter(Boolean),
    agentId: String(fd.get("agentId") ?? ""),
    reason: String(fd.get("reason") ?? "") || undefined,
  });
  if (!parsed.success) return invalid(parsed.error);
  const { ids, agentId, reason } = parsed.data;

  const r = await runAction(async () => {
    const { actor } = await authService.requireCookies("inquiries.assign");
    return inquiryService.bulkAssign(actor, ids, agentId, reason || undefined);
  });
  if (r.ok) {
    revalidatePath("/admin/inquiries");
    revalidatePath("/admin");
    for (const one of ids.slice(0, 50)) revalidatePath(`/admin/inquiries/${one}`);
  }
  return r;
}

const unassignSchema = z.strictObject({ id, reason: shortText(300) });

export async function unassignInquiry(input: z.input<typeof unassignSchema>): Promise<ActionResult<{ status: InquiryStatus }>> {
  const parsed = unassignSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, reason } = parsed.data;
  return run("inquiries.claim", inquiryId, async (actor) => {
    const d = await inquiryService.unassign(actor, inquiryId, reason || undefined);
    return { status: d.status };
  });
}

/* ----------------------------------------------------------- transition */

const transitionSchema = z.strictObject({
  id,
  to: z.enum(STATUSES),
  reason: shortText(100),
  note: shortText(2000),
});

export async function transitionInquiry(input: z.input<typeof transitionSchema>): Promise<ActionResult<{ status: InquiryStatus }>> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, to, reason, note } = parsed.data;
  if (to === "lost" && !(LOST_REASONS as readonly string[]).includes(reason ?? "")) return fieldError("reason", "Pick a loss reason");
  return run("inquiries.update", inquiryId, async (actor) => {
    const d = await inquiryService.transition(actor, inquiryId, to, { reason: reason || undefined, note: note || undefined });
    return { status: d.status };
  });
}

/* ---------------------------------------------------------------- notes */

const noteSchema = z.strictObject({ id, note: z.string().trim().min(1, "Write something first").max(2000) });

export async function addInquiryNote(input: z.input<typeof noteSchema>): Promise<ActionResult<undefined>> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, note } = parsed.data;
  return run("inquiries.update", inquiryId, async (actor) => {
    await inquiryService.addNote(actor, inquiryId, note);
    return undefined;
  });
}

/* -------------------------------------------------------------- contact */

const contactSchema = z.strictObject({ id, note: shortText(2000) });

export async function logInquiryContact(input: z.input<typeof contactSchema>): Promise<ActionResult<{ status: InquiryStatus }>> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, note } = parsed.data;
  return run("inquiries.update", inquiryId, async (actor) => {
    const d = await inquiryService.logContact(actor, inquiryId, note || undefined);
    return { status: d.status };
  });
}

/* ----------------------------------------------------------------- item */

const money = z.number().finite().min(0).max(100_000_000);
const itemSchema = z.strictObject({
  id,
  itemId: id,
  /** Both or neither — the DB stores INR and AED side by side. */
  confirmedInr: money.optional(),
  confirmedAed: money.optional(),
  clearConfirmed: z.boolean().optional(),
  availabilityNote: shortText(500),
  availabilityChecked: z.boolean().optional(),
});

export async function updateInquiryItem(
  input: z.input<typeof itemSchema>,
): Promise<ActionResult<{ toleranceExceeded: boolean; tolerancePercent: number }>> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, itemId, confirmedInr, confirmedAed, clearConfirmed, availabilityNote, availabilityChecked } = parsed.data;
  if ((confirmedInr === undefined) !== (confirmedAed === undefined)) return fieldError("confirmedAed", "Enter the confirmed price in both currencies");
  return run("inquiries.update", inquiryId, async (actor) => {
    const r = await inquiryService.updateItem(actor, inquiryId, itemId, {
      confirmedTotal: clearConfirmed ? null : confirmedInr !== undefined && confirmedAed !== undefined ? { inr: confirmedInr, aed: confirmedAed } : undefined,
      availabilityNote,
      availabilityChecked,
    });
    return { toleranceExceeded: r.toleranceExceeded, tolerancePercent: r.tolerancePercent };
  });
}

/* ----------------------------------------------------------------- spam */

const spamSchema = z.strictObject({ id, reason: z.string().trim().min(1, "Say why").max(200), suppress: z.boolean() });

export async function markInquirySpam(input: z.input<typeof spamSchema>): Promise<ActionResult<{ status: InquiryStatus }>> {
  const parsed = spamSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, reason, suppress } = parsed.data;
  return run("inquiries.mark_spam", inquiryId, async (actor) => {
    const d = await inquiryService.markSpam(actor, inquiryId, { reason, suppress });
    return { status: d.status };
  });
}

/* -------------------------------------------------------------- convert */

const convertSchema = z.strictObject({
  id,
  paymentLinkUrl: z.union([z.literal(""), z.string().trim().url().max(500)]).optional(),
  paymentLinkId: shortText(100),
  gatewayPaymentId: shortText(100),
  amountPaidInr: money.optional(),
  method: shortText(40),
  paidAt: z.string().trim().max(40).optional(),
  note: shortText(2000),
});

export async function convertInquiry(
  input: z.input<typeof convertSchema>,
): Promise<ActionResult<{ orderReference: string; orderId: string }>> {
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, paidAt, paymentLinkUrl, ...rest } = parsed.data;
  let paidAtIso: string | undefined;
  if (paidAt) {
    const d = new Date(paidAt);
    if (Number.isNaN(d.getTime())) return fieldError("paidAt", "Enter a valid date and time");
    if (d.getTime() > Date.now() + 5 * 60_000) return fieldError("paidAt", "Paid-at cannot be in the future");
    paidAtIso = d.toISOString();
  }
  return run("inquiries.convert", inquiryId, async (actor) => {
    const r = await inquiryService.convertToOrder(actor, inquiryId, {
      paymentLinkUrl: paymentLinkUrl || undefined,
      paymentLinkId: rest.paymentLinkId || undefined,
      gatewayPaymentId: rest.gatewayPaymentId || undefined,
      amountPaidInr: rest.amountPaidInr,
      method: rest.method || undefined,
      paidAt: paidAtIso,
      note: rest.note || undefined,
    });
    return { orderReference: r.order.reference, orderId: r.order.id };
  });
}

/* --------------------------------------------------------------- resend */

const resendSchema = z.strictObject({ id, notificationId: id });

export async function resendInquiryNotification(
  input: z.input<typeof resendSchema>,
): Promise<ActionResult<{ status: "sent" | "failed" | "suppressed"; error?: string }>> {
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id: inquiryId, notificationId } = parsed.data;
  return run("notifications.resend", inquiryId, async (actor) => {
    const r = await notificationService.resend(actor, notificationId);
    return { status: r.status, error: r.error };
  });
}

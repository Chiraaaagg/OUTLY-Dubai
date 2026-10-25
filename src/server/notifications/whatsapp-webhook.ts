import "server-only";
import { log } from "../lib/logger";
import { sha256Hex } from "../lib/crypto";
import { notificationsRepo } from "../repositories/notifications.repo";
import { recordConsent } from "../repositories/consent.repo";
import { isStopKeyword, parseWhatsAppWebhook, providerEventIdOf, type WebhookItem } from "./whatsapp-webhook.parse";

/**
 * Inbound WhatsApp webhook processing (§08.5.2, §13.4, §19 §3).
 *
 *   (route) bounded raw read → verify signature over those bytes
 *     → (here) parse → persist each item to webhook_events (dedup) → apply
 *
 * What is real today:
 *  - Nothing is persisted before the signature is verified. A request that
 *    fails provider authentication gets a 401 and leaves no row behind; the
 *    only trace is a sampled, metadata-only log line (`recordRejection`).
 *  - Delivery receipts → notifications.status / delivered_at (match on
 *    provider_id = message id).
 *  - STOP / UNSUBSCRIBE → consent rows (granted=false) for whatsapp
 *    transactional AND marketing, synchronously, before returning (AC-WA-03).
 *
 * TODO(whatsapp-bsp): everything conversational — find-or-create
 * wa_conversations by phone, hydrate entry_context from the "Ref:" token,
 * extend csw_expires_at, route to an agent, out-of-hours auto-ack. Inbound
 * messages are persisted only; nothing pretends to reply.
 */

const PROVIDER = "whatsapp";
/** Hard ceiling for one delivery; Meta batches stay far below it. Enforced while streaming by the route. */
export const MAX_BODY_BYTES = 1_000_000;

export interface IngestResult {
  /** Always true here: callers only reach ingestion after verifying the signature. */
  signatureValid: true;
  /** Why the verified payload was not stored, when it was not. */
  skipped?: "invalid_json";
  stored: number;
  duplicates: number;
  processed: number;
  errors: number;
}

/** Short, non-reversible fingerprint of a body for log correlation. Never the body itself. */
export function bodyFingerprint(body: Uint8Array): string {
  return sha256Hex(Buffer.from(body.buffer, body.byteOffset, body.byteLength)).slice(0, 16);
}

/**
 * Process a delivery whose signature the caller has ALREADY verified over
 * `rawBody`. Never call this with unverified bytes.
 *
 * A correctly signed body that is not JSON (or not UTF-8) is acknowledged
 * and dropped with one bounded log line: it came from the provider, retrying
 * cannot make it parse, and a non-2xx would only start a retry loop. Its
 * contents are not stored.
 */
export async function ingestVerifiedWhatsAppWebhook(rawBody: Uint8Array): Promise<IngestResult> {
  const result: IngestResult = { signatureValid: true, stored: 0, duplicates: 0, processed: 0, errors: 0 };
  const bodyHash = bodyFingerprint(rawBody);

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    log.warn("whatsapp.webhook.invalid_json", { bytes: rawBody.byteLength, bodyHash });
    result.skipped = "invalid_json";
    return result;
  }

  // Persist each message/status once, then apply.
  const parsed = parseWhatsAppWebhook(payload);
  if (!parsed.items.length) {
    const id = await notificationsRepo.insertWebhookEvent({ provider: PROVIDER, providerEventId: `payload:${bodyHash}`, eventType: parsed.object ?? "unknown", payload, signatureValid: true });
    if (id) {
      result.stored++;
      await notificationsRepo.markWebhookProcessed(id);
    } else result.duplicates++;
    return result;
  }

  for (const item of parsed.items) {
    const id = await notificationsRepo.insertWebhookEvent({
      provider: PROVIDER,
      providerEventId: providerEventIdOf(item),
      eventType: item.kind === "message" ? `message.${item.type}` : `status.${item.status}`,
      payload: item.raw,
      signatureValid: true,
    });
    if (!id) {
      result.duplicates++;
      continue;
    }
    result.stored++;
    try {
      await applyItem(item);
      await notificationsRepo.markWebhookProcessed(id);
      result.processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("whatsapp.webhook.apply_failed", { eventType: item.kind, error: message });
      await notificationsRepo.markWebhookProcessed(id, message).catch(() => {});
      result.errors++;
    }
  }
  return result;
}

/* ------------------------------------------------------------------ rejections */

export type RejectionReason =
  | "secret_not_configured"
  | "body_too_large"
  | "body_unreadable"
  | "signature_missing"
  | "signature_malformed"
  | "signature_mismatch";

/**
 * Per-instance budget for REJECTED deliveries, keyed on the trusted client
 * IP (`clientIp`, or one shared bucket when the deployment cannot vouch for
 * an IP). Only failures are counted, and the route consults it only after a
 * request has already failed verification, so:
 *   - a valid, correctly signed delivery is never refused because of it;
 *   - nothing the caller controls (signature header, body, event ids) picks
 *     or resets the bucket.
 * An IP over budget gets 429 instead of 401 and stops producing log lines.
 * Trade-off: callers behind one shared IP (a NAT, a proxy) share one
 * budget — only for traffic that is being rejected anyway. When no trusted
 * IP is available every rejected caller shares the single "none" bucket.
 * It is per instance and in memory: a bound on what one instance spends on
 * rejected traffic, not a global quota.
 */
export const REJECTION_BUDGET_PER_IP = 60;
export const REJECTION_WINDOW_MS = 60_000;
/** Bound on distinct budget keys held per instance; beyond it new keys share one overflow bucket. */
const MAX_BUDGET_KEYS = 5_000;
/** Log the first rejection per reason per window, then every Nth, with a count of what was skipped. */
export const REJECTION_LOG_EVERY = 100;

const budget = new Map<string, { windowStart: number; count: number }>();
const logWindows = new Map<RejectionReason | "rejection_budget_exceeded", { windowStart: number; count: number }>();

function windowOf(now: number): number {
  return Math.floor(now / REJECTION_WINDOW_MS) * REJECTION_WINDOW_MS;
}

function takeBudget(ipKey: string, now: number): { allowed: boolean; retryAfterSeconds: number } {
  const windowStart = windowOf(now);
  if (budget.size >= MAX_BUDGET_KEYS && !budget.has(ipKey)) {
    for (const [k, v] of budget) if (v.windowStart !== windowStart) budget.delete(k);
    if (budget.size >= MAX_BUDGET_KEYS) ipKey = "overflow";
  }
  let b = budget.get(ipKey);
  if (!b || b.windowStart !== windowStart) {
    b = { windowStart, count: 0 };
    budget.set(ipKey, b);
  }
  b.count++;
  return { allowed: b.count <= REJECTION_BUDGET_PER_IP, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + REJECTION_WINDOW_MS - now) / 1000)) };
}

function sampledWarn(reason: RejectionReason | "rejection_budget_exceeded", fields: Record<string, unknown>, now: number) {
  const windowStart = windowOf(now);
  let w = logWindows.get(reason);
  if (!w || w.windowStart !== windowStart) {
    w = { windowStart, count: 0 };
    logWindows.set(reason, w);
  }
  w.count++;
  if (w.count === 1 || w.count % REJECTION_LOG_EVERY === 1) {
    const suppressed = w.count === 1 ? 0 : REJECTION_LOG_EVERY - 1;
    const level = reason === "secret_not_configured" ? "error" : "warn";
    log[level]("whatsapp.webhook.rejected", { reason, ...fields, seenInWindow: w.count, suppressed });
  }
}

/**
 * Account for one rejected delivery: charge the caller's rejection budget
 * and emit (sampled) metadata — reason, byte length, a 16-hex body hash.
 * Never the signature header, the body or the secret.
 *
 * Returns whether the caller is still within budget. A missing secret is a
 * configuration fault, not abuse, so it is logged but not charged.
 */
export function recordRejection(input: { reason: RejectionReason; ip?: string; body?: Uint8Array; bytes?: number }): { withinBudget: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const fields = {
    bytes: input.body?.byteLength ?? input.bytes,
    bodyHash: input.body ? bodyFingerprint(input.body) : undefined,
  };
  if (input.reason === "secret_not_configured") {
    sampledWarn(input.reason, fields, now);
    return { withinBudget: true, retryAfterSeconds: 0 };
  }
  const verdict = takeBudget(input.ip ?? "none", now);
  if (!verdict.allowed) {
    sampledWarn("rejection_budget_exceeded", { lastReason: input.reason }, now);
    return { withinBudget: false, retryAfterSeconds: verdict.retryAfterSeconds };
  }
  sampledWarn(input.reason, fields, now);
  return { withinBudget: true, retryAfterSeconds: 0 };
}

/** Test hook: forget every budget and log window. */
export function __resetWebhookRejectionState(): void {
  budget.clear();
  logWindows.clear();
}

type DeliveryStatus = "sent" | "delivered" | "read" | "failed";
const DELIVERY_STATUSES: readonly DeliveryStatus[] = ["sent", "delivered", "read", "failed"];

/** Only the statuses that move a notification row; "deleted"/"warning" are stored but not applied. */
function deliveryStatus(s: string): DeliveryStatus | undefined {
  return DELIVERY_STATUSES.find((d) => d === s);
}

async function applyItem(item: WebhookItem): Promise<void> {
  if (item.kind === "status") {
    const status = deliveryStatus(item.status);
    if (status) {
      const updated = await notificationsRepo.applyProviderStatus(item.messageId, status, item.timestamp, item.error);
      log.info("whatsapp.webhook.status", { status, matched: updated, billable: item.pricing?.billable });
    }
    // TODO(whatsapp-bsp): record `billable` / `cost_minor` from `pricing` on the matched row (§08.2, WA-15).
    return;
  }

  // Inbound message.
  if (item.type === "text" && isStopKeyword(item.text)) {
    const evidence = { messageId: item.id, receivedAt: item.timestamp.toISOString(), keyword: item.text?.trim().toUpperCase(), channel: "whatsapp" };
    await recordConsent({ phoneE164: item.from, channel: "whatsapp", purpose: "transactional", granted: false, source: "stop_keyword", evidence });
    await recordConsent({ phoneE164: item.from, channel: "whatsapp", purpose: "marketing", granted: false, source: "stop_keyword", evidence });
    log.info("whatsapp.webhook.opt_out", { messageId: item.id });
    return;
  }

  // TODO(whatsapp-bsp): conversation routing (find-or-create wa_conversations,
  // csw_expires_at = now + 24h, entry_context from "Ref:", agent assignment,
  // out-of-hours auto-ack, START/re-opt-in keyword). Persisted only for now.
  log.info("whatsapp.webhook.inbound_stored", { messageId: item.id, type: item.type, hasReferral: Boolean(item.referral) });
}

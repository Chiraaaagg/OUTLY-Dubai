import "server-only";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { sha256Hex } from "../lib/crypto";
import { notificationsRepo } from "../repositories/notifications.repo";
import { recordConsent } from "../repositories/consent.repo";
import { isStopKeyword, parseWhatsAppWebhook, providerEventIdOf, verifyMetaSignature, type WebhookItem } from "./whatsapp-webhook.parse";

/**
 * Inbound WhatsApp webhook processing (§08.5.2, §13.4, §19 §3).
 *
 *   verify signature → persist raw to webhook_events (dedup) → apply → done
 *
 * What is real today:
 *  - Signature verification over the raw body; unsigned/invalid payloads are
 *    persisted with signature_valid=false and never processed.
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
const MAX_BODY_BYTES = 1_000_000;

export interface IngestResult {
  signatureValid: boolean;
  /** Why the payload was not processed, when it was not. */
  skipped?: "secret_not_configured" | "invalid_signature" | "invalid_json" | "body_too_large";
  stored: number;
  duplicates: number;
  processed: number;
  errors: number;
}

export async function ingestWhatsAppWebhook(input: { rawBody: string; signatureHeader: string | null }): Promise<IngestResult> {
  const result: IngestResult = { signatureValid: false, stored: 0, duplicates: 0, processed: 0, errors: 0 };
  const bodyHash = sha256Hex(input.rawBody).slice(0, 32);

  if (Buffer.byteLength(input.rawBody) > MAX_BODY_BYTES) {
    log.warn("whatsapp.webhook.body_too_large", { bytes: Buffer.byteLength(input.rawBody) });
    result.skipped = "body_too_large";
    return result;
  }

  // 1. Signature. Without a configured secret nothing is trusted (§13.4).
  const secret = env().WHATSAPP_WEBHOOK_SECRET;
  if (!secret) {
    result.skipped = "secret_not_configured";
  } else if (!verifyMetaSignature(input.rawBody, input.signatureHeader, secret)) {
    result.skipped = "invalid_signature";
  } else {
    result.signatureValid = true;
  }

  // 2. Parse. Invalid JSON is still recorded so ops can see what arrived.
  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    result.skipped ??= "invalid_json";
    payload = { raw: input.rawBody.slice(0, 10_000) };
  }

  if (result.skipped) {
    // Keyed by body hash, not by message id, so a later correctly-signed
    // redelivery of the same event is not deduplicated against this one.
    log.warn("whatsapp.webhook.not_processed", { reason: result.skipped, bodyHash });
    const id = await notificationsRepo.insertWebhookEvent({
      provider: PROVIDER,
      providerEventId: `unverified:${bodyHash}`,
      eventType: result.skipped,
      payload,
      signatureValid: result.signatureValid,
      processingError: result.skipped,
    });
    if (id) result.stored++;
    else result.duplicates++;
    return result;
  }

  // 3. Persist each message/status once, then apply.
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

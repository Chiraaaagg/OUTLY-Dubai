import type { NextRequest } from "next/server";
import { env } from "@/server/lib/env";
import { clientIp, json, readBodyBytes } from "@/server/lib/http";
import { isAppError } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";
import { safeEqual } from "@/server/lib/crypto";
import { checkMetaSignature } from "@/server/notifications/whatsapp-webhook.parse";
import { MAX_BODY_BYTES, ingestVerifiedWhatsAppWebhook, recordRejection, type RejectionReason } from "@/server/notifications/whatsapp-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks/whatsapp — Meta subscription verification.
 * Echoes `hub.challenge` only when `hub.verify_token` matches
 * WHATSAPP_WEBHOOK_VERIFY_TOKEN. 403 when the token is not configured:
 * a webhook nobody set up must not be verifiable.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");

  let expected: string | undefined;
  try {
    expected = env().WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  } catch {
    expected = undefined;
  }
  if (!expected || mode !== "subscribe" || !challenge || !token || !safeEqual(token, expected)) {
    log.warn("whatsapp.webhook.verify_rejected", { configured: Boolean(expected), mode });
    return new Response("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
  }
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * POST /api/webhooks/whatsapp — inbound messages and delivery receipts.
 *
 * Server-to-server: authenticated by Meta's `X-Hub-Signature-256` HMAC, not
 * by Origin or cookies, so `assertSameOrigin` deliberately does not apply.
 *
 *   1. No secret configured → 503, nothing read or stored. Meta retries
 *      until the deployment is configured instead of losing the event.
 *   2. Body read with a streamed 1 MB ceiling (413 over it, whatever
 *      Content-Length claims; 400 if the client aborts mid-body).
 *   3. HMAC verified over exactly those bytes. Missing, malformed or wrong
 *      signature → 401 and nothing stored.
 *   4. Only then parsed, persisted (deduplicated per provider event id) and
 *      applied → 200.
 *
 * Rejections never touch the database. They are charged to a per-instance,
 * per-trusted-IP budget (429 once exhausted) and logged as sampled metadata
 * only — see `recordRejection`. An unexpected failure while persisting a
 * verified delivery answers 500 so Meta redelivers; deduplication makes the
 * retry safe.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  let secret: string | undefined;
  try {
    secret = env().WHATSAPP_WEBHOOK_SECRET;
  } catch {
    secret = undefined;
  }
  if (!secret) {
    recordRejection({ reason: "secret_not_configured", ip });
    return plain("Webhook not configured", 503, { "retry-after": "300" });
  }

  let body: Uint8Array;
  try {
    body = await readBodyBytes(req, MAX_BODY_BYTES);
  } catch (error) {
    const tooLarge = isAppError(error) && error.status === 413;
    return reject({ reason: tooLarge ? "body_too_large" : "body_unreadable", ip, bytes: tooLarge ? MAX_BODY_BYTES + 1 : undefined }, tooLarge ? 413 : 400);
  }

  const verdict = checkMetaSignature(body, req.headers.get("x-hub-signature-256"), secret);
  if (verdict !== "ok") {
    const reason: RejectionReason = verdict === "missing" ? "signature_missing" : verdict === "malformed" ? "signature_malformed" : "signature_mismatch";
    return reject({ reason, ip, body }, 401);
  }

  try {
    const result = await ingestVerifiedWhatsAppWebhook(body);
    log.info("whatsapp.webhook.received", { ...result });
  } catch (error) {
    log.error("whatsapp.webhook.failed", { error: error instanceof Error ? error.message : String(error) });
    return json({ received: false }, { status: 500 });
  }
  return json({ received: true });
}

function plain(text: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers } });
}

function reject(input: { reason: RejectionReason; ip?: string; body?: Uint8Array; bytes?: number }, status: 400 | 401 | 413): Response {
  const charged = recordRejection(input);
  if (!charged.withinBudget) return plain("Too many rejected requests", 429, { "retry-after": String(charged.retryAfterSeconds) });
  return plain(status === 401 ? "Invalid signature" : status === 413 ? "Payload too large" : "Bad request", status);
}

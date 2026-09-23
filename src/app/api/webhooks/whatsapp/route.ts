import type { NextRequest } from "next/server";
import { env } from "@/server/lib/env";
import { json } from "@/server/lib/http";
import { log } from "@/server/lib/logger";
import { safeEqual } from "@/server/lib/crypto";
import { ingestWhatsAppWebhook } from "@/server/notifications/whatsapp-webhook";

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
 * Always answers 200 (§13.4: a non-2xx triggers provider retry storms).
 * Signature verification, dedup and processing live in
 * `src/server/notifications/whatsapp-webhook.ts`; a failure there is logged,
 * never surfaced to the provider.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text().catch(() => "");
  try {
    const result = await ingestWhatsAppWebhook({ rawBody, signatureHeader: req.headers.get("x-hub-signature-256") });
    log.info("whatsapp.webhook.received", { ...result });
  } catch (error) {
    log.error("whatsapp.webhook.failed", { error: error instanceof Error ? error.message : String(error) });
  }
  return json({ received: true });
}

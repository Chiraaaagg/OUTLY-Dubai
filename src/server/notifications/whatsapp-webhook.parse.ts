import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure parsing + signature helpers for the WhatsApp (Meta Cloud API shape)
 * inbound webhook. No env, no I/O — unit-tested directly. The BSPs we are
 * considering (Wati, Interakt, AiSensy, Gupshup) either proxy this exact
 * shape or can be configured to; anything else needs a mapper here and
 * nowhere else.
 */

export interface InboundMessage {
  kind: "message";
  /** The provider's own message object, persisted verbatim to webhook_events. */
  raw: unknown;
  /** Provider message id (wamid...). Dedup key. */
  id: string;
  /** Sender phone in E.164 (Meta sends digits without "+"). */
  from: string;
  timestamp: Date;
  type: string;
  /** Text body when type === "text" (or the caption for media). */
  text?: string;
  /** Meta contact profile name — untrusted display text. */
  profileName?: string;
  /** Click-to-WhatsApp ad referral, when present (§08.2 free entry window). */
  referral?: { sourceUrl?: string; sourceId?: string; sourceType?: string; ctwaClid?: string };
}

export interface StatusUpdate {
  kind: "status";
  /** The provider's own status object, persisted verbatim to webhook_events. */
  raw: unknown;
  /** Provider message id the status refers to — matches notifications.providerId. */
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed" | "deleted" | "warning" | (string & {});
  timestamp: Date;
  recipient?: string;
  error?: string;
  conversationId?: string;
  pricing?: { billable?: boolean; category?: string; pricingModel?: string };
}

export type WebhookItem = InboundMessage | StatusUpdate;

export interface ParsedWebhook {
  items: WebhookItem[];
  /** Meta object type, e.g. whatsapp_business_account. */
  object?: string;
}

export type MetaSignatureVerdict = "ok" | "missing" | "malformed" | "mismatch";

const SIGNATURE_HEADER = /^sha256=([0-9a-f]{64})$/i;

/**
 * Checks `X-Hub-Signature-256: sha256=<hex>` against an HMAC-SHA256 of the
 * exact request bytes, with a constant-time compare of the two digests.
 *
 * Takes bytes, not a string, on purpose: the HMAC must cover what arrived on
 * the wire. Decoding to text first and re-encoding would silently change any
 * body that is not clean UTF-8, and a signature over different bytes proves
 * nothing. The verdict says *why* a header was refused so the caller can log
 * a reason without ever logging the header itself.
 */
export function checkMetaSignature(rawBody: Uint8Array, header: string | null | undefined, secret: string): MetaSignatureVerdict {
  if (!header || !header.trim()) return "missing";
  const match = SIGNATURE_HEADER.exec(header.trim());
  if (!match) return "malformed";
  if (!secret) return "mismatch";
  const provided = Buffer.from(match[1], "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected) ? "ok" : "mismatch";
}

/** Boolean form of `checkMetaSignature`. */
export function verifyMetaSignature(rawBody: Uint8Array, header: string | null | undefined, secret: string): boolean {
  return checkMetaSignature(rawBody, header, secret) === "ok";
}

/** Builds the header value — for tests and for local replay tooling. */
export function signMetaPayload(rawBody: Uint8Array | string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/** Inbound STOP keywords (§08.7). Whole message only, so "please stop calling" is not an opt-out. */
export const STOP_KEYWORD = /^(stop|unsubscribe)$/i;

export function isStopKeyword(text: string | undefined): boolean {
  return Boolean(text && STOP_KEYWORD.test(text.trim()));
}

export function toE164(digits: string): string {
  const d = digits.replace(/[^\d]/g, "");
  return d ? `+${d}` : "";
}

function toDate(ts: unknown): Date {
  const n = typeof ts === "string" ? Number.parseInt(ts, 10) : typeof ts === "number" ? ts : Number.NaN;
  if (Number.isFinite(n) && n > 0) return new Date(n < 1e12 ? n * 1000 : n);
  return new Date();
}

function str(v: unknown, max = 4000): string | undefined {
  return typeof v === "string" && v.length ? v.slice(0, max) : undefined;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Flattens a Meta webhook envelope into messages and statuses. Tolerant: an
 * unrecognised shape yields zero items rather than throwing, because the
 * route must answer 200 regardless.
 */
export function parseWhatsAppWebhook(payload: unknown): ParsedWebhook {
  const root = obj(payload);
  const items: WebhookItem[] = [];
  if (!root) return { items };

  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const value = obj(obj(change)?.value);
      if (!value) continue;

      const contactNames = new Map<string, string>();
      for (const c of arr(value.contacts)) {
        const co = obj(c);
        const waId = str(co?.wa_id, 32);
        const name = str(obj(co?.profile)?.name, 200);
        if (waId && name) contactNames.set(waId, name);
      }

      for (const m of arr(value.messages)) {
        const mo = obj(m);
        const id = str(mo?.id, 200);
        const from = str(mo?.from, 32);
        if (!mo || !id || !from) continue;
        const type = str(mo.type, 40) ?? "unknown";
        const text = str(obj(mo.text)?.body) ?? str(obj(mo[type])?.caption);
        const ref = obj(mo.referral);
        items.push({
          kind: "message",
          raw: mo,
          id,
          from: toE164(from),
          timestamp: toDate(mo.timestamp),
          type,
          text,
          profileName: contactNames.get(from),
          referral: ref
            ? { sourceUrl: str(ref.source_url, 500), sourceId: str(ref.source_id, 100), sourceType: str(ref.source_type, 40), ctwaClid: str(ref.ctwa_clid, 200) }
            : undefined,
        });
      }

      for (const s of arr(value.statuses)) {
        const so = obj(s);
        const messageId = str(so?.id, 200);
        const status = str(so?.status, 40);
        if (!so || !messageId || !status) continue;
        const firstError = obj(arr(so.errors)[0]);
        const pricing = obj(so.pricing);
        items.push({
          kind: "status",
          raw: so,
          messageId,
          status: status.toLowerCase(),
          timestamp: toDate(so.timestamp),
          recipient: str(so.recipient_id, 32) ? toE164(str(so.recipient_id, 32)!) : undefined,
          error: firstError ? [str(firstError.code, 20), str(firstError.title, 200), str(obj(firstError.error_data)?.details, 300)].filter(Boolean).join(": ") : undefined,
          conversationId: str(obj(so.conversation)?.id, 200),
          pricing: pricing ? { billable: typeof pricing.billable === "boolean" ? pricing.billable : undefined, category: str(pricing.category, 40), pricingModel: str(pricing.pricing_model, 40) } : undefined,
        });
      }
    }
  }
  return { items, object: str(root.object, 60) };
}

/** Stable dedup key per item: message id for inbound, id + status for receipts (one message yields several). */
export function providerEventIdOf(item: WebhookItem): string {
  return item.kind === "message" ? `msg:${item.id}` : `status:${item.messageId}:${item.status}`;
}

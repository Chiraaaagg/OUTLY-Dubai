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

/** Verifies `X-Hub-Signature-256: sha256=<hex>` over the RAW body with a constant-time compare. */
export function verifyMetaSignature(rawBody: string | Buffer, header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const provided = header.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided.toLowerCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Builds the header value — for tests and for local replay tooling. */
export function signMetaPayload(rawBody: string | Buffer, secret: string): string {
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

import "server-only";
import { env } from "../lib/env";
import { sha256Hex } from "../lib/crypto";
import { log } from "../lib/logger";
import { analyticsRepo, type PendingOfflineConversionRow } from "../repositories/analytics.repo";

/**
 * Meta Offline Conversions (AC-META-02) — the job that makes Rail B wins
 * visible to Meta optimisation. In inquiry mode EVERY purchase is offline:
 * the agent wins the inquiry days after the click, on a payment link, so the
 * Pixel and CAPI never see a `Purchase`. Without this upload Meta optimises
 * against zero purchase signal (§17 §1.5, §5.3).
 *
 * Chain that must stay intact (§11.4.2):
 *   ad click -> fbclid on the landing URL -> `outlyy_attr` cookie (fbc derived)
 *   -> POST /api/inquiries `attribution` -> `inquiries.attribution`
 *   -> convertToOrder copies fbclid/fbc/fbp -> `order_attribution`
 *   -> this job -> Meta.
 *
 * This module prepares upload rows with PII already hashed. The HTTP upload
 * itself is TODO(meta-offline) — nothing is marked uploaded until it exists.
 *
 * TODO(meta-offline): implement `uploadOfflineConversions`.
 *   Endpoint: POST https://graph.facebook.com/v21.0/{META_OFFLINE_EVENT_SET_ID}/events
 *             ?access_token={META_CAPI_ACCESS_TOKEN}
 *             (requires a new env var META_OFFLINE_EVENT_SET_ID; ask the
 *             Backend Architect to add it to src/server/lib/env.ts)
 *   Body: { upload_tag: "outlyy-<YYYY-MM-DD>", data: [ {
 *     event_name: "Purchase",
 *     event_time: unix seconds of paidAt (fallback confirmedAt),
 *     order_id: orderReference,
 *     value: totalInr / 100, currency: "INR",
 *     match_keys: { email: [em], phone: [ph], fbc?, fbp? },   // hashed below
 *     custom_data: { source_inquiry_id }
 *   } ] }
 *   Meta accepts events up to 62 days old; run daily, batch <= 2000, and on a
 *   2xx call `analyticsRepo.markOfflineUploaded(orderIds)`. Partial failures:
 *   inspect `num_processed_entries` and only mark the accepted ids.
 *   Reconcile weekly against Ads Manager within 10% (AC-META-03).
 */

export interface OfflineConversionUpload {
  orderId: string;
  orderReference: string;
  sourceInquiryId: string | null;
  /** Unix seconds. */
  eventTime: number;
  /** Major units (INR). */
  value: number;
  currency: string;
  matchKeys: {
    /** SHA-256 of the lowercased, trimmed email. */
    em?: string;
    /** SHA-256 of the E.164 number with the leading + removed (digits only). */
    ph?: string;
    fbc?: string;
    fbp?: string;
  };
  /** True when at least one Meta match key is present. Rows without one cannot be matched and are skipped. */
  matchable: boolean;
}

function hashEmail(email: string | null): string | undefined {
  const v = email?.trim().toLowerCase();
  return v ? sha256Hex(v) : undefined;
}

function hashPhone(phone: string | null): string | undefined {
  const digits = phone?.replace(/\D/g, "");
  return digits ? sha256Hex(digits) : undefined;
}

export function toUpload(row: PendingOfflineConversionRow): OfflineConversionUpload {
  const at = row.paidAt ?? row.confirmedAt ?? new Date();
  const matchKeys: OfflineConversionUpload["matchKeys"] = {
    em: hashEmail(row.leadEmail),
    ph: hashPhone(row.leadPhone),
    fbc: row.fbc ?? undefined,
    fbp: row.fbp ?? undefined,
  };
  return {
    orderId: row.orderId,
    orderReference: row.orderReference,
    sourceInquiryId: row.sourceInquiryId,
    eventTime: Math.floor(at.getTime() / 1000),
    value: Number(row.totalInr) / 100,
    currency: row.currency,
    matchKeys,
    matchable: Boolean(matchKeys.em || matchKeys.ph || matchKeys.fbc || matchKeys.fbp),
  };
}

/**
 * Orders ready for upload, with contact PII already hashed. Raw email/phone
 * never leave this function.
 */
export async function pendingOfflineConversions(limit = 100): Promise<OfflineConversionUpload[]> {
  const rows = await analyticsRepo.pendingOfflineConversions(limit);
  return rows.map(toUpload);
}

/** Marks orders as uploaded. Only call after Meta has acknowledged them. */
export async function markUploaded(orderIds: string[]): Promise<number> {
  const count = await analyticsRepo.markOfflineUploaded(orderIds);
  log.info("analytics.offline_conversions.marked", { count });
  return count;
}

export interface OfflineConversionRunSummary {
  pending: number;
  matchable: number;
  uploaded: number;
  adapter: "not_implemented" | "skipped";
  /** Present when the pass did no work, so a green cron log does not read as a successful upload. */
  skippedReason?: "not_configured";
}

/** Meta needs both an event set to write to and a token to write with. */
function metaConfigured(): boolean {
  const e = env();
  return Boolean(e.META_OFFLINE_EVENT_SET_ID && e.META_CAPI_ACCESS_TOKEN);
}

/**
 * One scheduled pass.
 *
 * Until Meta is configured this does nothing at all — and says so. It used to
 * load up to 500 orders and hash their email and phone every night to produce
 * "uploaded: 0", which is daily work on customer PII for no result, and a log
 * line that looks like a healthy upload. Reading and hashing contact details
 * is only justified when there is somewhere to send them.
 */
export async function runOfflineConversions(limit = 500): Promise<OfflineConversionRunSummary> {
  if (!metaConfigured()) {
    log.info("analytics.offline_conversions.skipped", { reason: "not_configured", need: ["META_OFFLINE_EVENT_SET_ID", "META_CAPI_ACCESS_TOKEN"] });
    return { pending: 0, matchable: 0, uploaded: 0, adapter: "skipped", skippedReason: "not_configured" };
  }

  const pending = await pendingOfflineConversions(limit);
  const matchable = pending.filter((p) => p.matchable).length;
  // TODO(meta-offline): const accepted = await uploadOfflineConversions(pending.filter(p => p.matchable)); await markUploaded(accepted);
  log.warn("analytics.offline_conversions.adapter_missing", { pending: pending.length, matchable, uploaded: 0 });
  return { pending: pending.length, matchable, uploaded: 0, adapter: "not_implemented" };
}

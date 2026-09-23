import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, clientIp, handle, json, parseJson } from "@/server/lib/http";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { hashIp, sha256Hex } from "@/server/lib/crypto";
import { env } from "@/server/lib/env";
import { lookupInquirySchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bucket used when no client IP can be determined (local dev without a proxy).
 * Behind Vercel/Netlify x-forwarded-for is always set. A single shared bucket
 * is deliberate: the limiter never fails open to "unlimited" for IP-less
 * traffic — it just shares one 5/15min allowance.
 */
const NO_IP_BUCKET = "lookup:ip:none";
/** Per-reference cap, so a known reference cannot have its phone guessed across many IPs. */
const PER_REFERENCE_LIMIT = 20;

/**
 * POST /api/inquiries/lookup — customer status check. Reference AND phone
 * must both match (§17 §9 #4); any mismatch is a 404 so the endpoint never
 * confirms that a reference exists. Rate limited per IP
 * (`LOOKUP_RATE_LIMIT_PER_IP` / `LOOKUP_RATE_LIMIT_WINDOW_SECONDS`, default
 * 5 per 15 minutes). Returns the customer-safe projection only.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const e = env();
  const ipHash = hashIp(clientIp(req));
  await enforceRateLimit({
    key: ipHash ? `lookup:ip:${ipHash}` : NO_IP_BUCKET,
    limit: e.LOOKUP_RATE_LIMIT_PER_IP,
    windowSeconds: e.LOOKUP_RATE_LIMIT_WINDOW_SECONDS,
  });
  const body = await parseJson(req, lookupInquirySchema);
  await enforceRateLimit({
    key: `lookup:ref:${sha256Hex(body.reference.trim().toUpperCase()).slice(0, 16)}`,
    limit: PER_REFERENCE_LIMIT,
    windowSeconds: e.LOOKUP_RATE_LIMIT_WINDOW_SECONDS,
  });
  const view = await inquiryService.lookupForCustomer(body.reference, body.phone, body.countryCode);
  return json(view);
});

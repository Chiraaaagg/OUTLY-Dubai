import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, clientIp, handle, json, parseJson, userAgent } from "@/server/lib/http";
import { createInquirySchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inquiries — the storefront's terminal event in inquiry mode
 * (§17 §5.2). Public, same-origin only. The service validates identity,
 * rate-limits per phone and IP, evaluates spam, re-prices every item
 * server-side, persists, routes to an agent and fires the acknowledgements.
 * Client prices are never trusted; a mismatch is recorded as a signal.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const body = await parseJson(req, createInquirySchema);
  const result = await inquiryService.create(body, { ip: clientIp(req), userAgent: userAgent(req) });
  return json(result, { status: 201 });
});

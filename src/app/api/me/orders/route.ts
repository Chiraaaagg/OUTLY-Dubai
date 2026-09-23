import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { customerService } from "@/server/services/customer.service";
import { handle, json } from "@/server/lib/http";
import { RATE, publicRateLimit } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/orders — `{ items }`: reference, status, dates, items and totals. No net cost, no payment rows. */
export const GET = handle(async (req: NextRequest) => {
  await publicRateLimit(req, "me", RATE.publicSearch);
  const session = await customerAuthService.requireRequest(req);
  const items = await customerService.listOrders(session);
  return json({ items });
});

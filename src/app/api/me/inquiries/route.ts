import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { customerService } from "@/server/services/customer.service";
import { handle, json } from "@/server/lib/http";
import { RATE, publicRateLimit } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/inquiries — `{ items }`: the customer projection of every inquiry linked to this phone. */
export const GET = handle(async (req: NextRequest) => {
  await publicRateLimit(req, "me", RATE.publicSearch);
  const session = await customerAuthService.requireRequest(req);
  const items = await customerService.listInquiries(session);
  return json({ items });
});

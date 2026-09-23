import type { NextRequest } from "next/server";
import { customerAuthService } from "@/server/services/customer-auth.service";
import { customerService } from "@/server/services/customer.service";
import { handle, json } from "@/server/lib/http";
import { RATE, publicRateLimit } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/export — the customer's data as a JSON download (DPDP access request). Audited in the service. */
export const GET = handle(async (req: NextRequest) => {
  await publicRateLimit(req, "me", RATE.publicSearch);
  const session = await customerAuthService.requireRequest(req);
  const data = await customerService.exportData(session);
  const stamp = new Date().toISOString().slice(0, 10);
  return json(data, {
    headers: {
      "content-disposition": `attachment; filename="outlyy-account-${stamp}.json"`,
      "x-content-type-options": "nosniff",
    },
  });
});

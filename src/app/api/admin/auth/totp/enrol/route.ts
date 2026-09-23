import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { assertSameOrigin, handle, json } from "@/server/lib/http";
import { pendingTokenFromRequest } from "@/server/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/auth/totp/enrol — issues a fresh TOTP secret for a pending user (AC-SEC-02). */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const result = await authService.beginTotpEnrolment(pendingTokenFromRequest(req));
  return json(result);
});

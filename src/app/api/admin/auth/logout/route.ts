import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { assertSameOrigin, handle, json } from "@/server/lib/http";
import { clearSessionCookies, sessionTokenFromRequest } from "@/server/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  await authService.logout(sessionTokenFromRequest(req));
  const res = json({ ok: true });
  clearSessionCookies(res);
  return res;
});

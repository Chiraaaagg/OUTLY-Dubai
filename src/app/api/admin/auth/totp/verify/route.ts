import { z } from "zod";
import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { assertSameOrigin, clientIp, handle, json, parseJson, userAgent } from "@/server/lib/http";
import { pendingTokenFromRequest, setSessionCookie } from "@/server/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict();

/** POST /api/admin/auth/totp/verify — completes login (or enrolment) and sets the session cookie. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const { code } = await parseJson(req, schema);
  const session = await authService.completeTotp({
    pendingToken: pendingTokenFromRequest(req),
    code,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });
  const res = json({ ok: true, expiresAt: session.expiresAt.toISOString() });
  setSessionCookie(res, session.token, session.expiresAt);
  return res;
});

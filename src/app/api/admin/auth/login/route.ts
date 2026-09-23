import { z } from "zod";
import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { assertSameOrigin, clientIp, handle, json, parseJson, userAgent } from "@/server/lib/http";
import { setPendingCookie } from "@/server/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(1).max(200),
  })
  .strict();

/** POST /api/admin/auth/login — password step. Never reveals whether the email exists. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const body = await parseJson(req, schema);
  const { stage, token } = await authService.login({
    email: body.email,
    password: body.password,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });
  const res = json({ next: stage });
  setPendingCookie(res, token);
  return res;
});

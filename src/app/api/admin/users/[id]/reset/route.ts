import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { AppError } from "@/server/lib/errors";
import { assertSameOrigin, handle, json, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { resetCredentialsSchema, userIdSchema } from "@/server/schemas/admin.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/:id/reset — new one-time password, all sessions
 * revoked, optional TOTP reset (`users.manage`). Body may be empty.
 */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "users.manage");
  const id = parseWith(userIdSchema, (await params).id);
  const raw = await req.text();
  let parsedBody: unknown = {};
  if (raw.trim()) {
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      throw new AppError({ status: 400, code: "VALIDATION_FAILED", message: "Malformed JSON body" });
    }
  }
  const opts = parseWith(resetCredentialsSchema, parsedBody);
  const result = await authService.resetCredentials(actor, id, opts);
  return json(result);
});

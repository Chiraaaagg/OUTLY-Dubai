import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { updateUserSchema, userIdSchema } from "@/server/schemas/admin.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/users/:id — status, roles, names, availability (`users.manage`). */
export const PATCH = handle<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "users.manage");
  const id = parseWith(userIdSchema, (await params).id);
  const patch = await parseJson(req, updateUserSchema);
  const user = await authService.updateUser(actor, id, patch);
  return json(user);
});

import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { assertSameOrigin, handle, json, parseJson } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { createUserSchema } from "@/server/schemas/admin.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users — list staff accounts (`users.manage`).
 * List is served by `authService.listUsers` (permission-checked in the service).
 */
export const GET = handle(async (req: NextRequest) => {
  const { actor } = await requireAdmin(req, "users.manage");
  const users = await authService.listUsers(actor);
  return json({ items: users });
});

/** POST /api/admin/users — create; returns the one-time password exactly once. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "users.manage");
  const body = await parseJson(req, createUserSchema);
  const result = await authService.createUser(actor, body);
  return json(result, { status: 201 });
});

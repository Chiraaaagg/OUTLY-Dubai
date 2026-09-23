import type { NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { handle, json } from "@/server/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/auth/me — current user + permissions (for the console shell). */
export const GET = handle(async (req: NextRequest) => {
  const session = await authService.requireRequest(req);
  const { user, actor, expiresAt } = session;
  return json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    displayName: actor.displayName,
    roles: user.roles,
    permissions: [...actor.permissions],
    totpEnabled: user.totpEnabled,
    expiresAt: expiresAt.toISOString(),
  });
});

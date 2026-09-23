import type { NextRequest } from "next/server";
import { auditRepo } from "@/server/repositories/audit.repo";
import { handle, json, parseQuery } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { auditQuerySchema } from "@/server/schemas/admin.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit?action&entity&entityId&actor&from&to&page&pageSize
 * (`audit.view`). Reads the audit repository directly — the contract in
 * §19 §3 names it as the one route that does.
 */
export const GET = handle(async (req: NextRequest) => {
  await requireAdmin(req, "audit.view");
  const q = parseQuery(req, auditQuerySchema);
  const result = await auditRepo.list({
    action: q.action,
    entityType: q.entity,
    entityId: q.entityId,
    actorId: q.actor,
    from: q.from,
    to: q.to,
    page: q.page,
    pageSize: q.pageSize,
  });
  return json(result);
});

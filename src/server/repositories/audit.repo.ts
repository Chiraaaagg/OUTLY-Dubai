import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

/**
 * Read side of `audit_logs` for `GET /api/admin/audit` (§19 §3). Rows are
 * written only through `src/server/lib/audit.ts`; this module never writes.
 * Both indexes the console needs exist: `audit_logs_entity_idx`
 * (entity_type, entity_id, created_at DESC) and `audit_logs_actor_idx`
 * (actor_id, created_at DESC).
 */

export interface AuditListFilters {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string; // ISO date or datetime
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditRow {
  id: string;
  actorType: "customer" | "agent" | "admin" | "system" | "supplier";
  actorId?: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  createdAt: string;
}

export interface AuditListResult {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const auditRepo = {
  async list(filters: AuditListFilters): Promise<AuditListResult> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = { startsWith: filters.action };
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to.length === 10 ? `${filters.to}T23:59:59.999Z` : filters.to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.auditLog.count({ where }),
    ]);

    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
    const actors = actorIds.length
      ? await prisma.adminUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      : [];
    const names = new Map(actors.map((a) => [a.id, a.fullName]));

    return {
      items: rows.map((r) => ({
        id: r.id.toString(),
        actorType: r.actorType,
        actorId: r.actorId ?? undefined,
        actorName: r.actorId ? names.get(r.actorId) : undefined,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before: r.before ?? undefined,
        after: r.after ?? undefined,
        reason: r.reason ?? undefined,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  },

  /** Full trail for one entity, oldest first — the detail page timeline. */
  async forEntity(entityType: string, entityId: string, limit = 100): Promise<AuditRow[]> {
    const r = await auditRepo.list({ entityType, entityId, pageSize: limit });
    return r.items.reverse();
  },
};

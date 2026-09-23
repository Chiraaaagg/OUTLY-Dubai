import "server-only";
import { prisma } from "../lib/db";
import type { Permission, RoleCode } from "../lib/permissions";

/**
 * Admin users, roles, sessions. Returns plain shapes; never a Prisma model
 * with the password hash attached to anything that leaves the service layer.
 */

export interface AdminUserRecord {
  id: string;
  email: string;
  fullName: string;
  status: "active" | "suspended";
  totpEnabled: boolean;
  whatsappDisplayName: string | null;
  photoUrl: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: RoleCode[];
  permissions: Permission[];
  availability: {
    status: "available" | "busy" | "away" | "offline";
    maxConcurrent: number;
    skills: string[];
    languages: string[];
    shift: string;
    title: string | null;
  } | null;
}

const userInclude = {
  roles: { include: { role: { include: { permissions: true } } } },
  availability: true,
} as const;

type Raw = NonNullable<Awaited<ReturnType<typeof findRaw>>>;

async function findRaw(where: { id?: string; email?: string }) {
  return prisma.adminUser.findFirst({ where: { ...where, deletedAt: null }, include: userInclude });
}

export function toRecord(u: Raw): AdminUserRecord {
  const roles = u.roles.map((r) => r.role.code as RoleCode);
  const perms = new Set<Permission>();
  for (const r of u.roles) for (const p of r.role.permissions) perms.add(p.permission as Permission);
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    status: u.status,
    totpEnabled: u.totpEnabled,
    whatsappDisplayName: u.whatsappDisplayName,
    photoUrl: u.photoUrl,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    roles,
    permissions: [...perms],
    availability: u.availability
      ? {
          status: u.availability.status,
          maxConcurrent: u.availability.maxConcurrent,
          skills: u.availability.skills,
          languages: u.availability.languages,
          shift: u.availability.shift,
          title: u.availability.title,
        }
      : null,
  };
}

export const adminRepo = {
  /**
   * Session + user + roles + permissions in ONE query — every admin request
   * resolves a session, and on a remote Postgres each round trip is the cost
   * that matters (measured ~1.4 s from a distant client, 5–20 ms co-located).
   */
  async findSessionWithUser(sessionId: string) {
    const s = await prisma.adminSession.findUnique({ where: { id: sessionId }, include: { user: { include: userInclude } } });
    if (!s) return null;
    const { user: raw, ...session } = s;
    return { session, user: raw.deletedAt ? null : toRecord(raw) };
  },

  async findById(id: string): Promise<AdminUserRecord | null> {
    const u = await findRaw({ id });
    return u ? toRecord(u) : null;
  },

  async findByEmail(email: string): Promise<AdminUserRecord | null> {
    const u = await findRaw({ email: email.toLowerCase().trim() });
    return u ? toRecord(u) : null;
  },

  /** Login only — the one read that returns credential material. */
  async findCredentialsByEmail(email: string) {
    return prisma.adminUser.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      select: {
        id: true,
        passwordHash: true,
        totpEnabled: true,
        totpSecretEncrypted: true,
        status: true,
        failedLoginCount: true,
        lockedUntil: true,
      },
    });
  },

  async findTotpSecret(id: string) {
    return prisma.adminUser.findUnique({
      where: { id },
      select: { totpEnabled: true, totpSecretEncrypted: true, email: true, status: true, deletedAt: true },
    });
  },

  async list(): Promise<AdminUserRecord[]> {
    const rows = await prisma.adminUser.findMany({
      where: { deletedAt: null },
      include: userInclude,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toRecord);
  },

  /** Agents who can receive inquiries, with their current open load (§17 §7.3). */
  async listRoutable() {
    const rows = await prisma.adminUser.findMany({
      where: { deletedAt: null, status: "active", totpEnabled: true, roles: { some: { role: { code: { in: ["agent", "agent_lead", "ops", "admin"] } } } } },
      include: {
        ...userInclude,
        _count: {
          select: {
            assignedInquiries: {
              where: { status: { in: ["assigned", "contacted", "quoted", "negotiating", "payment_pending"] } },
            },
          },
        },
      },
    });
    return rows.map((u) => ({ ...toRecord(u), openCount: u._count.assignedInquiries }));
  },

  async roleIdsByCode(codes: string[]) {
    const roles = await prisma.role.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    return roles;
  },
};

import "server-only";
import type { NextRequest } from "next/server";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma, TX_OPTIONS } from "../lib/db";
import { env } from "../lib/env";
import { Errors } from "../lib/errors";
import { log } from "../lib/logger";
import { uuidv7 } from "../lib/ids";
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashIp,
  hashPassword,
  randomToken,
  sha256Hex,
  totpUri,
  verifyPassword,
  verifyTotp,
} from "../lib/crypto";
import { enforceRateLimit } from "../lib/rate-limit";
import { audit } from "../lib/audit";
import type { Actor } from "../lib/actor";
import { requirePermission } from "../lib/actor";
import type { Permission } from "../lib/permissions";
import { adminRepo, type AdminUserRecord } from "../repositories/admin.repo";
import {
  pendingTokenFromCookies,
  pendingTokenFromRequest,
  sessionTokenFromCookies,
  sessionTokenFromRequest,
  signPendingToken,
  signSessionToken,
  verifyPendingToken,
  verifySessionToken,
} from "../lib/session";

/**
 * Admin and agent authentication (§13.2.2):
 *   email + password → mandatory TOTP → 8-hour absolute session.
 * No permission is granted until `totp_enabled` — a user without MFA can only
 * reach the enrolment step. Login rate-limited 5/email/15min and by IP;
 * lockout after 10 consecutive failures. Every login attempt is audited.
 */

const LOCK_AFTER = 10;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 12;
/** Well-formed scrypt string (16-byte salt, 64-byte digest) so the unknown-email path runs a full verify — same cost as a real one. */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export interface ResolvedSession {
  actor: Actor;
  user: AdminUserRecord;
  sessionId: string;
  expiresAt: Date;
}

function actorFromUser(user: AdminUserRecord, ctx?: { ipHash?: string; userAgent?: string }): Actor {
  const isAgentOnly = user.roles.every((r) => r === "agent" || r === "agent_lead");
  return {
    type: isAgentOnly ? "agent" : "admin",
    id: user.id,
    email: user.email,
    displayName: user.whatsappDisplayName ?? user.fullName,
    roles: user.roles,
    permissions: new Set(user.totpEnabled && user.status === "active" ? user.permissions : []),
    ...ctx,
  };
}

async function resolveFromToken(token: string | undefined, ctx?: { ipHash?: string; userAgent?: string }): Promise<ResolvedSession | null> {
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  const found = await adminRepo.findSessionWithUser(claims.sid);
  if (!found) return null;
  const { session, user } = found;
  if (session.revokedAt || session.expiresAt < new Date() || session.adminUserId !== claims.sub) return null;
  if (!user || user.status !== "active") return null;
  return { actor: actorFromUser(user, ctx), user, sessionId: session.id, expiresAt: session.expiresAt };
}

/**
 * Per-request memo for Server Components: the admin root layout, the console
 * layout and the page guard all resolve the same cookie in one render.
 * React's `cache()` dedupes them to a single database round trip.
 */
const resolveCookiesCached = cache(async (): Promise<ResolvedSession | null> => resolveFromToken(await sessionTokenFromCookies()));

export const authService = {
  /* ---------------------------------------------------------------- login */

  async login(input: { email: string; password: string; ip?: string; userAgent?: string }) {
    const email = input.email.toLowerCase().trim();
    const e = env();
    await enforceRateLimit({ key: `admin_login:email:${sha256Hex(email).slice(0, 16)}`, limit: e.ADMIN_LOGIN_RATE_LIMIT_PER_15MIN, windowSeconds: 900 });
    if (input.ip) await enforceRateLimit({ key: `admin_login:ip:${hashIp(input.ip)}`, limit: 20, windowSeconds: 900 });

    const creds = await adminRepo.findCredentialsByEmail(email);
    const ctx = { ipHash: hashIp(input.ip), userAgent: input.userAgent };
    const genericFail = () => Errors.unauthorized("Email or password is incorrect");

    if (!creds) {
      // Constant-ish time: still run a hash verify so timing does not reveal existence.
      verifyPassword(input.password, DUMMY_HASH);
      log.warn("admin.login.unknown_email", { emailHash: sha256Hex(email).slice(0, 12) });
      throw genericFail();
    }
    if (creds.status !== "active") {
      // Same message and same cost as an unknown email — the response must not reveal that the account exists (§13.2).
      verifyPassword(input.password, DUMMY_HASH);
      await audit({ type: "admin", id: creds.id, roles: [], permissions: new Set(), ...ctx }, "auth.login_suspended", { type: "admin_user", id: creds.id });
      throw genericFail();
    }
    if (creds.lockedUntil && creds.lockedUntil > new Date()) {
      throw Errors.unauthorized("Too many failed attempts. Try again in a few minutes.");
    }

    if (!verifyPassword(input.password, creds.passwordHash)) {
      const failed = creds.failedLoginCount + 1;
      await prisma.adminUser.update({
        where: { id: creds.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await audit({ type: "admin", id: creds.id, roles: [], permissions: new Set(), ...ctx }, "auth.login_failed", { type: "admin_user", id: creds.id });
      throw genericFail();
    }

    await prisma.adminUser.update({ where: { id: creds.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    const stage: "totp" | "enrol" = creds.totpEnabled ? "totp" : "enrol";
    const token = await signPendingToken({ sub: creds.id, stage });
    await audit({ type: "admin", id: creds.id, roles: [], permissions: new Set(), ...ctx }, "auth.password_ok", { type: "admin_user", id: creds.id }, { after: { stage } });
    return { stage, token };
  },

  /* ----------------------------------------------------------------- totp */

  /** Starts (or restarts) MFA enrolment for a pending user. */
  async beginTotpEnrolment(pendingToken: string | undefined) {
    const claims = pendingToken ? await verifyPendingToken(pendingToken) : null;
    if (!claims || claims.stage !== "enrol") throw Errors.unauthorized("Sign in again to set up two-factor authentication");
    const user = await adminRepo.findTotpSecret(claims.sub);
    if (!user || user.deletedAt || user.status !== "active") throw Errors.unauthorized();
    if (user.totpEnabled) throw Errors.conflict("Two-factor authentication is already enabled");
    const secret = generateTotpSecret();
    await prisma.adminUser.update({ where: { id: claims.sub }, data: { totpSecretEncrypted: encryptSecret(secret) } });
    return { secret, otpauthUri: totpUri(secret, user.email) };
  },

  /** Verifies a TOTP code for a pending login (either stage) and mints the session. */
  async completeTotp(input: { pendingToken?: string; code: string; ip?: string; userAgent?: string }) {
    const claims = input.pendingToken ? await verifyPendingToken(input.pendingToken) : null;
    if (!claims) throw Errors.unauthorized("Your sign-in expired. Start again.");
    await enforceRateLimit({ key: `admin_totp:${claims.sub}`, limit: 8, windowSeconds: 600 });

    const user = await adminRepo.findTotpSecret(claims.sub);
    if (!user || user.deletedAt || user.status !== "active" || !user.totpSecretEncrypted) {
      throw Errors.totpEnrolmentRequired();
    }
    const secret = decryptSecret(user.totpSecretEncrypted);
    if (!verifyTotp(secret, input.code)) {
      await audit({ type: "admin", id: claims.sub, roles: [], permissions: new Set(), ipHash: hashIp(input.ip), userAgent: input.userAgent }, "auth.totp_failed", { type: "admin_user", id: claims.sub });
      throw Errors.unauthorized("That code didn't match. Codes change every 30 seconds.");
    }

    // Replay guard: a code that already minted a session cannot be used again
    // inside its validity window (RFC 6238 §5.2). Keyed on user + code, kept
    // for 2 minutes, so a sniffed code is worthless after first use.
    const replayKey = `totp:${claims.sub}:${sha256Hex(input.code.replace(/\s+/g, "")).slice(0, 24)}`;
    try {
      await prisma.idempotencyKey.create({
        data: { key: replayKey, scope: "admin_totp", requestHash: "used", completedAt: new Date(), expiresAt: new Date(Date.now() + 120_000) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await audit({ type: "admin", id: claims.sub, roles: [], permissions: new Set(), ipHash: hashIp(input.ip), userAgent: input.userAgent }, "auth.totp_replayed", { type: "admin_user", id: claims.sub });
        throw Errors.unauthorized("That code was already used. Wait for the next one.");
      }
      throw error;
    }
    void prisma.idempotencyKey.deleteMany({ where: { scope: "admin_totp", expiresAt: { lt: new Date() } } }).catch(() => {});

    if (claims.stage === "enrol" && !user.totpEnabled) {
      await prisma.adminUser.update({ where: { id: claims.sub }, data: { totpEnabled: true } });
    }

    return authService.createSession(claims.sub, { ip: input.ip, userAgent: input.userAgent });
  },

  /* -------------------------------------------------------------- session */

  async createSession(userId: string, ctx: { ip?: string; userAgent?: string }) {
    const hours = env().AUTH_ADMIN_SESSION_HOURS || 8;
    const expiresAt = new Date(Date.now() + hours * 3600_000);
    const sid = uuidv7();
    const refresh = randomToken(32);
    await prisma.adminSession.create({
      data: { id: sid, adminUserId: userId, refreshHash: sha256Hex(refresh), userAgent: ctx.userAgent, ipHash: hashIp(ctx.ip), expiresAt },
    });
    await prisma.adminUser.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    await audit({ type: "admin", id: userId, roles: [], permissions: new Set(), ipHash: hashIp(ctx.ip), userAgent: ctx.userAgent }, "auth.login", { type: "admin_session", id: sid });
    const token = await signSessionToken({ sid, sub: userId }, expiresAt);
    return { token, expiresAt, sessionId: sid };
  },

  async logout(sessionToken: string | undefined) {
    const claims = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!claims) return;
    await prisma.adminSession.updateMany({ where: { id: claims.sid, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ type: "admin", id: claims.sub, roles: [], permissions: new Set() }, "auth.logout", { type: "admin_session", id: claims.sid });
  },

  async revokeAllSessions(actor: Actor, userId: string) {
    requirePermission(actor, "users.manage");
    await prisma.adminSession.updateMany({ where: { adminUserId: userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(actor, "auth.revoke_all", { type: "admin_user", id: userId });
  },

  /* ------------------------------------------------------------- resolve */

  /** Route handlers. */
  async resolveRequest(req: NextRequest): Promise<ResolvedSession | null> {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return resolveFromToken(sessionTokenFromRequest(req), { ipHash: hashIp(ip), userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? undefined });
  },

  /** Server Components / Server Actions. */
  async resolveCookies(): Promise<ResolvedSession | null> {
    return resolveCookiesCached();
  },

  async requireRequest(req: NextRequest, permission?: Permission): Promise<ResolvedSession> {
    const s = await authService.resolveRequest(req);
    if (!s) throw Errors.unauthorized();
    if (permission) requirePermission(s.actor, permission);
    return s;
  },

  async requireCookies(permission?: Permission): Promise<ResolvedSession> {
    const s = await authService.resolveCookies();
    if (!s) throw Errors.unauthorized();
    if (permission) requirePermission(s.actor, permission);
    return s;
  },

  async pendingStageFromRequest(req: NextRequest) {
    const claims = await verifyPendingToken(pendingTokenFromRequest(req) ?? "");
    return claims?.stage ?? null;
  },

  async pendingStageFromCookies() {
    const claims = await verifyPendingToken((await pendingTokenFromCookies()) ?? "");
    return claims?.stage ?? null;
  },

  /* -------------------------------------------------------- user admin */

  async listUsers(actor: Actor) {
    requirePermission(actor, "users.manage");
    return adminRepo.list();
  },

  async createUser(
    actor: Actor,
    input: { email: string; fullName: string; password?: string; roles: string[]; whatsappDisplayName?: string; shift?: string; languages?: string[]; skills?: string[]; title?: string },
  ) {
    requirePermission(actor, "users.manage");
    const email = input.email.toLowerCase().trim();
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing && !existing.deletedAt) throw Errors.conflict("An account with that email already exists");
    const roles = await adminRepo.roleIdsByCode(input.roles);
    if (roles.length !== input.roles.length) throw Errors.validation({ roles: "Unknown role" });
    if (input.password !== undefined && input.password.length < MIN_PASSWORD_LENGTH) {
      throw Errors.validation({ password: `Use at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const password = input.password ?? randomToken(12);
    const id = uuidv7();
    await prisma.$transaction(async (tx) => {
      await tx.adminUser.create({
        data: {
          id,
          email,
          fullName: input.fullName.trim(),
          passwordHash: hashPassword(password),
          whatsappDisplayName: input.whatsappDisplayName?.trim() || input.fullName.trim().split(" ")[0],
          roles: { create: roles.map((r) => ({ roleId: r.id })) },
          availability: {
            create: {
              shift: input.shift ?? "IST",
              languages: input.languages ?? ["English", "Hindi"],
              skills: input.skills ?? [],
              title: input.title ?? "Dubai trip specialist",
              status: "available",
            },
          },
        },
      });
      await audit(actor, "users.create", { type: "admin_user", id }, { after: { email, roles: input.roles } }, tx);
    }, TX_OPTIONS);
    // Returned once, never stored in clear. Caller shows it to the admin to hand over.
    return { id, temporaryPassword: password };
  },

  async updateUser(
    actor: Actor,
    userId: string,
    patch: { fullName?: string; status?: "active" | "suspended"; roles?: string[]; whatsappDisplayName?: string; photoUrl?: string; shift?: string; languages?: string[]; skills?: string[]; title?: string; maxConcurrent?: number; availabilityStatus?: "available" | "busy" | "away" | "offline" },
  ) {
    requirePermission(actor, "users.manage");
    const before = await adminRepo.findById(userId);
    if (!before) throw Errors.notFound("User");
    if (patch.roles) {
      const roles = await adminRepo.roleIdsByCode(patch.roles);
      if (roles.length !== patch.roles.length) throw Errors.validation({ roles: "Unknown role" });
      await prisma.$transaction([
        prisma.adminUserRole.deleteMany({ where: { adminUserId: userId } }),
        prisma.adminUserRole.createMany({ data: roles.map((r) => ({ adminUserId: userId, roleId: r.id })) }),
      ]);
    }
    await prisma.adminUser.update({
      where: { id: userId },
      data: {
        fullName: patch.fullName?.trim(),
        status: patch.status,
        whatsappDisplayName: patch.whatsappDisplayName?.trim(),
        photoUrl: patch.photoUrl?.trim(),
        availability: {
          upsert: {
            create: { shift: patch.shift ?? "IST", languages: patch.languages ?? [], skills: patch.skills ?? [], title: patch.title, maxConcurrent: patch.maxConcurrent ?? 8, status: patch.availabilityStatus ?? "available" },
            update: { shift: patch.shift, languages: patch.languages, skills: patch.skills, title: patch.title, maxConcurrent: patch.maxConcurrent, status: patch.availabilityStatus },
          },
        },
      },
    });
    if (patch.status === "suspended") {
      await prisma.adminSession.updateMany({ where: { adminUserId: userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    const after = await adminRepo.findById(userId);
    await audit(actor, "users.update", { type: "admin_user", id: userId }, { before, after });
    return after;
  },

  /** Admin-initiated reset; also clears MFA so the user re-enrols on next login. */
  async resetCredentials(actor: Actor, userId: string, opts: { resetTotp?: boolean } = {}) {
    requirePermission(actor, "users.manage");
    const password = randomToken(12);
    await prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: userId },
        data: {
          passwordHash: hashPassword(password),
          failedLoginCount: 0,
          lockedUntil: null,
          ...(opts.resetTotp ? { totpEnabled: false, totpSecretEncrypted: null } : {}),
        },
      });
      await tx.adminSession.updateMany({ where: { adminUserId: userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(actor, "users.reset_credentials", { type: "admin_user", id: userId }, { after: { resetTotp: Boolean(opts.resetTotp) } }, tx);
    }, TX_OPTIONS);
    return { temporaryPassword: password };
  },

  /** Self-service password change (re-auth with current password). */
  async changePassword(session: ResolvedSession, input: { currentPassword: string; newPassword: string }) {
    const creds = await adminRepo.findCredentialsByEmail(session.user.email);
    if (!creds || !verifyPassword(input.currentPassword, creds.passwordHash)) throw Errors.unauthorized("Current password is incorrect");
    if (input.newPassword.length < MIN_PASSWORD_LENGTH) throw Errors.validation({ newPassword: `Use at least ${MIN_PASSWORD_LENGTH} characters` });
    await prisma.adminUser.update({ where: { id: session.user.id }, data: { passwordHash: hashPassword(input.newPassword) } });
    await prisma.adminSession.updateMany({ where: { adminUserId: session.user.id, revokedAt: null, NOT: { id: session.sessionId } }, data: { revokedAt: new Date() } });
    await audit(session.actor, "auth.password_changed", { type: "admin_user", id: session.user.id });
  },
};

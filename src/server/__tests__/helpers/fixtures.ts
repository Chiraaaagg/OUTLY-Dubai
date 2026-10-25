import { NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import type { RoleCode } from "../../lib/permissions";
import { ROLE_CODES, ROLE_NAMES, ROLE_PERMISSIONS } from "../../lib/permissions";
import { uuidv7 } from "../../lib/ids";

/**
 * Shared fixtures for route-level and database security tests.
 *
 * Every helper writes only synthetic rows tagged with the caller's run id
 * (`zz-sec-<run>`), and `assertDisposableDb()` refuses to run unless
 * DATABASE_URL/DIRECT_URL point at the disposable local Postgres used for
 * these tests (loopback, port 55433, database `outly_*`). A test that writes
 * rows must call it in `beforeAll` before touching the database.
 */

export const dbEnabled = Boolean(process.env.DATABASE_URL);

export function assertDisposableDb(): void {
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const raw = process.env[key];
    if (!raw) {
      if (key === "DIRECT_URL") continue;
      throw new Error(`${key} is not set`);
    }
    const u = new URL(raw);
    if (u.hostname !== "127.0.0.1" || u.port !== "55433" || !/^\/outly_[a-z_]+$/.test(u.pathname)) {
      throw new Error(`${key} is not the disposable local test database — refusing to write fixtures`);
    }
  }
}

export function runId(): string {
  return uuidv7().slice(-8);
}

type Prisma = typeof import("../../lib/db").prisma;

async function db(): Promise<Prisma> {
  return (await import("../../lib/db")).prisma;
}

/** Roles and their permissions as the seed writes them (idempotent). */
export async function ensureRoles(): Promise<void> {
  const prisma = await db();
  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({ where: { code }, create: { id: uuidv7(), code, name: ROLE_NAMES[code] }, update: {} });
    await prisma.rolePermission.createMany({ data: ROLE_PERMISSIONS[code].map((permission) => ({ roleId: role.id, permission })), skipDuplicates: true });
  }
}

export interface StaffFixture {
  id: string;
  email: string;
  token: string;
  sessionId: string;
  /** `Cookie` header value carrying the admin session. */
  cookie: string;
}

/**
 * An active, TOTP-enrolled staff user with the given roles and a live
 * session, created through `authService.createSession` exactly as login does.
 * Password and TOTP secret are random and never used or stored in the test.
 */
export async function createStaff(run: string, label: string, roles: RoleCode[], opts: { status?: "active" | "suspended"; totpEnabled?: boolean } = {}): Promise<StaffFixture> {
  const prisma = await db();
  const { hashPassword } = await import("../../lib/crypto");
  const { authService } = await import("../../services/auth.service");
  const { SESSION_COOKIE } = await import("../../lib/session");
  await ensureRoles();
  const roleRows = await prisma.role.findMany({ where: { code: { in: roles } } });
  const id = uuidv7();
  const email = `zz-sec-${run}-${label}@outlyy.test`;
  await prisma.adminUser.create({
    data: {
      id,
      email,
      fullName: `Fixture ${label}`,
      passwordHash: hashPassword(randomBytes(24).toString("hex")),
      totpEnabled: opts.totpEnabled ?? true,
      status: opts.status ?? "active",
      roles: { create: roleRows.map((r) => ({ roleId: r.id })) },
    },
  });
  const { token, sessionId } = await authService.createSession(id, { userAgent: "vitest-fixture" });
  return { id, email, token, sessionId, cookie: `${SESSION_COOKIE}=${token}` };
}

export interface CustomerFixture {
  id: string;
  phoneE164: string;
  token: string;
  sessionId: string;
  cookie: string;
}

/** A customer with a live opaque session (token hashed with SHA-256, as minted by sign-in). */
export async function createCustomer(run: string, phoneE164: string): Promise<CustomerFixture> {
  const prisma = await db();
  const { CUSTOMER_COOKIE } = await import("../../lib/customer-session");
  const id = uuidv7();
  const token = randomBytes(32).toString("base64url");
  const sessionId = uuidv7();
  await prisma.customer.create({ data: { id, phoneE164, fullName: `zz-sec-${run}` } });
  await prisma.customerSession.create({
    data: { id: sessionId, customerId: id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) },
  });
  return { id, phoneE164, token, sessionId, cookie: `${CUSTOMER_COOKIE}=${token}` };
}

/** Synthetic E.164 number in the fictional-use +91 range, unique per run. */
export function syntheticPhone(run: string, n: number): string {
  const digits = (Number.parseInt(run.replace(/[^0-9a-f]/g, "").slice(-6) || "0", 16) % 1_000_000).toString().padStart(6, "0");
  return `+9199${digits}${String(n).padStart(2, "0")}`;
}

export function siteOrigin(): string {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").origin;
}

/**
 * Build a request for a route handler. Defaults to a same-origin browser
 * request (`Origin` = the configured site) with a JSON body; pass
 * `origin: null` to omit the header, or any string (including "null") to send it.
 */
export function apiRequest(
  path: string,
  opts: { method?: string; body?: unknown; rawBody?: string | Uint8Array; cookie?: string; origin?: string | null; contentType?: string | null; headers?: Record<string, string> } = {},
): NextRequest {
  const headers = new Headers(opts.headers ?? {});
  const origin = opts.origin === undefined ? siteOrigin() : opts.origin;
  if (origin !== null) headers.set("origin", origin);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  let body: BodyInit | undefined;
  if (opts.rawBody !== undefined) body = opts.rawBody as BodyInit;
  else if (opts.body !== undefined) body = JSON.stringify(opts.body);
  const contentType = opts.contentType === undefined ? (body !== undefined ? "application/json" : null) : opts.contentType;
  if (contentType) headers.set("content-type", contentType);
  return new NextRequest(new URL(path, siteOrigin()), { method: opts.method ?? (body !== undefined ? "POST" : "GET"), headers, body });
}

/** Route context for dynamic segments, as Next passes it. */
export function params<T extends Record<string, string>>(p: T): { params: Promise<T> } {
  return { params: Promise.resolve(p) };
}

/** Remove every staff user and customer this run created (sessions cascade). */
export async function cleanupPeople(run: string): Promise<void> {
  const prisma = await db();
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: `zz-sec-${run}-` } } });
  await prisma.customer.deleteMany({ where: { fullName: `zz-sec-${run}` } });
}

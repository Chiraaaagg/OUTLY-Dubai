import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";
import { AppError, Errors, isAppError } from "./errors";
import { log } from "./logger";
import { bigintReplacer } from "./money";
import { env } from "./env";
import { safeEqual } from "./crypto";

/**
 * Transport helpers for `app/api/**` route handlers (§04.3.1: parse, authorise,
 * call one service, map the response). Every handler is wrapped in `handle()`
 * so the error envelope and logging cannot be forgotten.
 */

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, bigintReplacer);
  return new NextResponse(body, {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

/**
 * Map anything thrown below the transport layer onto the one envelope.
 * Zod errors from a service-level `.parse()` become 422 with field paths;
 * Prisma's well-known codes become 409/404 (never the raw Prisma message);
 * everything else is a generic 500 with the request id for log correlation.
 */
function normaliseError(err: unknown): AppError {
  if (isAppError(err)) return err;
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_";
      if (!fields[path]) fields[path] = issue.message;
    }
    return Errors.validation(fields);
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return Errors.conflict("A record with the same unique value already exists");
    if (err.code === "P2025") return Errors.notFound();
    if (err.code === "P2003") return Errors.conflict("This record is still referenced by another record");
  }
  if (err instanceof SyntaxError) return new AppError({ status: 400, code: "VALIDATION_FAILED", message: "Malformed request body" });
  return Errors.internal();
}

export function errorResponse(err: unknown, requestId?: string): NextResponse {
  const app = normaliseError(err);
  const headers: Record<string, string> = {};
  if (requestId) headers["x-request-id"] = requestId;
  if (app.code === "RATE_LIMITED" && app.details?.retryAfterSeconds) {
    headers["retry-after"] = String(app.details.retryAfterSeconds);
  }
  if (app.status >= 500) log.error("request.failed", { code: app.code, message: app.message, requestId, error: isAppError(err) ? undefined : err });
  return json(app.toJSON(), { status: app.status, headers });
}

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<NextResponse | Response>;

/** Wraps a route handler with the error envelope and an `x-request-id` for log correlation. */
export function handle<Ctx = { params: Promise<Record<string, string>> }>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) ?? randomUUID();
    try {
      const res = await fn(req, ctx);
      if (!res.headers.has("x-request-id")) res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

/** Parses + validates a JSON body; unknown keys are rejected by the schema (§12.13). */
export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError({ status: 400, code: "VALIDATION_FAILED", message: "Malformed JSON body" });
  }
  return parseWith(schema, raw);
}

export function parseWith<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_";
      if (!fields[path]) fields[path] = issue.message;
    }
    throw Errors.validation(fields);
  }
  return result.data;
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string | string[]> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    const existing = obj[k];
    if (existing === undefined) obj[k] = v;
    else obj[k] = Array.isArray(existing) ? [...existing, v] : [existing, v];
  });
  return parseWith(schema, obj);
}

/** Client IP — Vercel/Netlify set x-forwarded-for; first hop is the client. */
export function clientIp(req: NextRequest): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || undefined;
  return req.headers.get("x-real-ip") ?? undefined;
}

export function userAgent(req: NextRequest): string | undefined {
  return req.headers.get("user-agent")?.slice(0, 300) ?? undefined;
}

export function geoCountry(req: NextRequest): string | undefined {
  return req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? undefined;
}

/**
 * Scheduled job authentication. Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET`; manual invocation may use `x-cron-secret`. Jobs are disabled
 * (503) when no secret is configured — never open by omission.
 */
export function requireCron(req: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret) throw Errors.notConfigured("CRON_SECRET");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const header = req.headers.get("x-cron-secret") ?? "";
  if (!(bearer && safeEqual(bearer, secret)) && !(header && safeEqual(header, secret))) {
    throw Errors.unauthorized("Invalid cron secret");
  }
}

/** Reject any origin that is not our own for browser-originated mutations. */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client (curl, server) — session cookie still required
  const allowed = new URL(env().NEXT_PUBLIC_SITE_URL).origin;
  const reqOrigin = req.nextUrl.origin;
  if (origin !== allowed && origin !== reqOrigin) {
    throw Errors.forbidden("cross-origin request");
  }
}

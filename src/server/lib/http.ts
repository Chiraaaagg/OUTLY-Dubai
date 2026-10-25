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
  if ((app.code === "RATE_LIMITED" || app.code === "UNAVAILABLE") && app.details?.retryAfterSeconds) {
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

/** Default ceiling for ordinary JSON API bodies. Routes that carry files or batches pass their own. */
export const DEFAULT_JSON_MAX_BYTES = 1024 * 1024;

const JSON_MEDIA_TYPE = /^application\/(?:json|[a-z0-9.+-]+\+json)\s*(?:;|$)/i;

/** True when the request declares a JSON body (`application/json`, `application/*+json`). */
export function isJsonRequest(req: Request): boolean {
  return JSON_MEDIA_TYPE.test(req.headers.get("content-type") ?? "");
}

/**
 * Read the request body as bytes, refusing anything over `maxBytes` (413).
 *
 * The limit is enforced while streaming, so a missing or false
 * `Content-Length` cannot make the server buffer more than the ceiling; a
 * declared length over the ceiling is refused before reading at all. A client
 * that aborts mid-body gets a 400, never a half-read body.
 */
export async function readBodyBytes(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = req.headers.get("content-length");
  if (declared !== null && declared.trim() !== "") {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) throw Errors.payloadTooLarge(maxBytes);
  }
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw Errors.payloadTooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (isAppError(error)) throw error;
    throw new AppError({ status: 400, code: "VALIDATION_FAILED", message: "Request body could not be read" });
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** `readBodyBytes` decoded as UTF-8 (invalid sequences become U+FFFD). */
export async function readBodyText(req: Request, maxBytes: number): Promise<string> {
  return new TextDecoder("utf-8").decode(await readBodyBytes(req, maxBytes));
}

/**
 * Parses + validates a JSON body; unknown keys are rejected by the schema (§12.13).
 *
 * The body must be declared as JSON (415 otherwise — a `text/plain` or form
 * post is a different request kind, and accepting it would let a cross-site
 * "simple" request reach JSON handlers) and is read with a byte ceiling (413).
 */
export async function parseJson<T>(req: NextRequest, schema: ZodType<T>, opts: { maxBytes?: number } = {}): Promise<T> {
  if (!isJsonRequest(req)) throw Errors.unsupportedMediaType();
  const text = await readBodyText(req, opts.maxBytes ?? DEFAULT_JSON_MAX_BYTES);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
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

/**
 * Client IP, under the deployment's proxy contract.
 *
 * Vercel overwrites `x-forwarded-for` / `x-real-ip` with the connecting
 * client's address (client-supplied values are discarded), so on Vercel
 * (`VERCEL=1` at runtime) they are trustworthy. Anywhere else nothing
 * guarantees that, so the headers are ignored unless the operator states
 * that a trusted proxy sets them (`TRUST_PROXY_IP_HEADERS=true`). Without a
 * trusted source the caller gets `undefined` and falls back to its shared
 * "no IP" bucket — never to an attacker-chosen value.
 */
export function clientIp(req: NextRequest): string | undefined {
  const trusted = process.env.VERCEL === "1" || process.env.TRUST_PROXY_IP_HEADERS === "true";
  if (!trusted) return undefined;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim().slice(0, 64) || undefined;
  return undefined;
}

export function userAgent(req: NextRequest): string | undefined {
  return req.headers.get("user-agent")?.slice(0, 300) ?? undefined;
}

/**
 * Edge geo country. On Vercel only Vercel's own header is read: a
 * `cf-ipcountry` header there would come from the client, not Cloudflare.
 */
export function geoCountry(req: NextRequest): string | undefined {
  if (process.env.VERCEL === "1") return req.headers.get("x-vercel-ip-country") ?? undefined;
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

/**
 * Origins allowed to send cookie-authenticated browser mutations: the
 * configured site origin, its www/apex counterpart (both hosts serve the
 * app), and any extra origins listed in `APP_ALLOWED_ORIGINS`. Never derived
 * from the request's Host or forwarded headers.
 */
export function allowedOrigins(): Set<string> {
  const e = env();
  const out = new Set<string>();
  const add = (raw: string) => {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") out.add(u.origin);
    } catch {
      // ignore a malformed entry rather than widening anything
    }
  };
  add(e.NEXT_PUBLIC_SITE_URL);
  try {
    const site = new URL(e.NEXT_PUBLIC_SITE_URL);
    const isIp = /^[\d.]+$/.test(site.hostname) || site.hostname.includes(":");
    if (!isIp && site.hostname.includes(".")) {
      const twin = site.hostname.startsWith("www.") ? site.hostname.slice(4) : `www.${site.hostname}`;
      add(`${site.protocol}//${twin}${site.port ? `:${site.port}` : ""}`);
    }
  } catch {
    // NEXT_PUBLIC_SITE_URL is validated as a URL by env(); nothing to add
  }
  for (const o of e.APP_ALLOWED_ORIGINS) add(o);
  return out;
}

/**
 * CSRF defence for every cookie-authenticated mutation (and the public
 * same-origin JSON endpoints that share it).
 *
 * Browsers attach `Origin` to every POST/PUT/PATCH/DELETE, so the request must
 * carry one and it must be an allowed origin. A missing `Origin` and the opaque
 * `null` origin (sandboxed frames, some redirects) are refused: neither proves
 * the request came from our pages. `Sec-Fetch-Site: cross-site` is refused as
 * a second signal. Server-to-server callers do not come through here — the
 * webhook (signature) and cron jobs (secret) authenticate on their own.
 */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") throw Errors.forbidden("same-origin request");
  if (!allowedOrigins().has(origin)) throw Errors.forbidden("same-origin request");
  if (req.headers.get("sec-fetch-site") === "cross-site") throw Errors.forbidden("same-origin request");
}

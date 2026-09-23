import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/db";
import { assertBootEnv, env } from "@/server/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — app + database + configuration warnings (§14.3).
 * Uptime monitors poll this from India and UAE. Returns 503 when the
 * database is unreachable; configuration warnings are informational.
 */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "error" = "ok";
  let dbLatencyMs: number | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - started;
  } catch {
    db = "error";
  }

  let warnings: string[] = [];
  let appEnv = "unknown";
  try {
    appEnv = env().APP_ENV;
    warnings = assertBootEnv();
  } catch (e) {
    warnings = [e instanceof Error ? e.message : "env invalid"];
  }

  const body = {
    status: db === "ok" ? "ok" : "degraded",
    appEnv,
    db,
    dbLatencyMs,
    warnings,
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: db === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
}

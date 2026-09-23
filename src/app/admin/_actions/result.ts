import "server-only";
import { isAppError } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";

/**
 * Uniform return shape for admin Server Actions so client forms can render
 * the §12 envelope (`message` + `recovery` + per-field errors) without
 * knowing which service threw. Actions never throw to the client.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; recovery?: string; fields?: Record<string, string> };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (isAppError(err)) {
      const fields = (err.details?.fields as Record<string, string> | undefined) ?? undefined;
      return { ok: false, code: err.code, message: err.message, recovery: err.recovery || undefined, fields };
    }
    log.error("admin.action.unhandled", { error: err });
    return { ok: false, code: "error", message: "Something went wrong at our end", recovery: "Try again in a moment." };
  }
}

/** FormData helpers — Server Actions receive strings; these normalise them. */
export const form = {
  str(fd: FormData, key: string): string | undefined {
    const v = fd.get(key);
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t === "" ? undefined : t;
  },
  num(fd: FormData, key: string): number | undefined {
    const s = form.str(fd, key);
    if (s === undefined) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  },
  bool(fd: FormData, key: string): boolean {
    const v = fd.get(key);
    return v === "on" || v === "true" || v === "1";
  },
  /** Comma-separated text field → trimmed list (empty → undefined). */
  list(fd: FormData, key: string): string[] | undefined {
    const s = form.str(fd, key);
    if (s === undefined) return undefined;
    const items = s.split(",").map((x) => x.trim()).filter(Boolean);
    return items.length ? items : undefined;
  },
  /** Multi-valued field (checkbox group). */
  all(fd: FormData, key: string): string[] {
    return fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
  },
};

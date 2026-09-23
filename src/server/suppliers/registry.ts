import { AppError } from "../lib/errors";
import { ManualAdapter } from "./manual/manual.adapter";
import type { SupplierPort } from "./port";
import { RathinLiveAdapter, rathinConfigFrom, type RathinEnvSlice } from "./rathin/rathin.adapter";
import { RathinMockAdapter } from "./rathin/rathin.mock";

/**
 * Supplier registry — `suppliers.adapter` + env → a `SupplierPort`.
 *
 *   adapter "manual" | "portal"  → ManualAdapter (portal suppliers are
 *                                  semi-manual until a PortalAdapter exists)
 *   adapter "rathin"             → RathinMockAdapter unless
 *                                  SUPPLIER_ADAPTER_RATHIN=live AND all
 *                                  RATHIN_* are set, then RathinLiveAdapter
 *
 * `env` is a parameter, not an import: this module and every adapter must be
 * importable from unit tests, and `src/server/lib/env.ts` is "server-only".
 * Services pass `env()` (its `Env` type satisfies `SupplierEnv`); tests pass
 * a literal. Nothing in `src/server/suppliers/**` reads `process.env`.
 */

export type SupplierEnv = RathinEnvSlice;

export type SupplierSelector =
  /** A `suppliers.adapter` value. */
  | string
  /** A row-ish object, e.g. the `supplier` relation on a mapping. */
  | { adapter: string; code?: string };

export const KNOWN_ADAPTERS = ["manual", "portal", "rathin"] as const;
export type KnownAdapter = (typeof KNOWN_ADAPTERS)[number];

export function isKnownAdapter(adapter: string): adapter is KnownAdapter {
  return (KNOWN_ADAPTERS as readonly string[]).includes(adapter);
}

/** Which Rathin adapter the env selects, for /api/health-style diagnostics. Never returns secrets. */
export function rathinMode(env: SupplierEnv): "mock" | "live" | "live_unconfigured" {
  if (env.SUPPLIER_ADAPTER_RATHIN !== "live") return "mock";
  return rathinConfigFrom(env) ? "live" : "live_unconfigured";
}

export function supplierFor(selector: SupplierSelector, env: SupplierEnv): SupplierPort {
  const adapter = typeof selector === "string" ? selector : selector.adapter;
  switch (adapter) {
    case "manual":
    case "portal":
      return new ManualAdapter();
    case "rathin":
      // `live_unconfigured` deliberately yields the LIVE adapter with a null
      // config so every call fails loudly with NOT_CONFIGURED — a half-set
      // production env must not silently fall back to the mock.
      return env.SUPPLIER_ADAPTER_RATHIN === "live" ? new RathinLiveAdapter(rathinConfigFrom(env)) : new RathinMockAdapter();
    default:
      // The adapter string comes from the database, never from a request, but
      // it is still not echoed into the message.
      throw new AppError({
        status: 503,
        code: "NOT_CONFIGURED",
        message: "Unknown supplier adapter",
        recovery: "Fix `suppliers.adapter` for this supplier; valid values are manual, portal, rathin.",
        details: { adapter },
      });
  }
}

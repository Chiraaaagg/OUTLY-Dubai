import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetEnvCache } from "../env";
import { allowedOrigins, assertSameOrigin } from "../http";

/** H04: which origins may send cookie-authenticated mutations. */
const saved = { ...process.env };

function withEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

function post(origin: string | null, extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  if (origin !== null) headers.set("origin", origin);
  return new NextRequest("https://outlyy.com/api/x", { method: "POST", headers });
}

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  resetEnvCache();
});

describe("allowedOrigins", () => {
  it("allows the configured site and its www twin", () => {
    withEnv({ NEXT_PUBLIC_SITE_URL: "https://outlyy.com", APP_ENV: "production", APP_ALLOWED_ORIGINS: undefined, VERCEL: undefined });
    expect([...allowedOrigins()].sort()).toEqual(["https://outlyy.com", "https://www.outlyy.com"]);
  });

  it("in production without NEXT_PUBLIC_SITE_URL allows the canonical site, not the localhost default", () => {
    withEnv({ NEXT_PUBLIC_SITE_URL: undefined, APP_ENV: "production", VERCEL: undefined });
    const set = allowedOrigins();
    expect(set.has("https://outlyy.com")).toBe(true);
    expect(set.has("https://www.outlyy.com")).toBe(true);
    expect(set.has("http://localhost:3000")).toBe(false);
  });

  it("outside production does not allow the canonical site unless configured", () => {
    withEnv({ NEXT_PUBLIC_SITE_URL: "https://staging.outlyy.com", APP_ENV: "staging", VERCEL: undefined });
    const set = allowedOrigins();
    expect(set.has("https://staging.outlyy.com")).toBe(true);
    expect(set.has("https://outlyy.com")).toBe(false);
  });

  it("adds Vercel's production domain and this deployment's URLs only on Vercel, and extra origins without twins", () => {
    withEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3217", APP_ENV: "development", VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "outlyy.com", VERCEL_URL: "outly-abc123.vercel.app", APP_ALLOWED_ORIGINS: "https://staging.outlyy.com, not a url" });
    const set = allowedOrigins();
    expect(set.has("http://localhost:3217")).toBe(true);
    expect(set.has("http://www.localhost:3217")).toBe(false);
    expect(set.has("https://outlyy.com")).toBe(true);
    expect(set.has("https://outly-abc123.vercel.app")).toBe(true);
    expect(set.has("https://www.outly-abc123.vercel.app")).toBe(false);
    expect(set.has("https://staging.outlyy.com")).toBe(true);
    expect(set.has("https://www.staging.outlyy.com")).toBe(false);
    withEnv({ VERCEL: undefined, VERCEL_PROJECT_PRODUCTION_URL: "evil.example", VERCEL_URL: "evil2.example" });
    expect(allowedOrigins().has("https://evil.example")).toBe(false);
    expect(allowedOrigins().has("https://evil2.example")).toBe(false);
  });
});

describe("assertSameOrigin", () => {
  it("accepts an allowed origin and refuses missing, null, foreign, lookalike and cross-site requests", () => {
    withEnv({ NEXT_PUBLIC_SITE_URL: "https://outlyy.com" });
    expect(() => assertSameOrigin(post("https://www.outlyy.com"))).not.toThrow();
    for (const o of [null, "null", "https://evil.example", "https://outlyy.com.evil.example", "http://outlyy.com", "https://outlyy.com:8443"]) {
      expect(() => assertSameOrigin(post(o)), String(o)).toThrow(/same-origin/);
    }
    expect(() => assertSameOrigin(post("https://outlyy.com", { "sec-fetch-site": "cross-site" }))).toThrow(/same-origin/);
    // The request's own Host never widens the set.
    expect(() => assertSameOrigin(new NextRequest("https://attacker.example/api/x", { method: "POST", headers: { origin: "https://attacker.example" } }))).toThrow(/same-origin/);
  });
});

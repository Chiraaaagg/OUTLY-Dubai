import { describe, expect, it } from "vitest";
import { apiRequest, dbEnabled } from "../helpers/fixtures";

/** G08/H16: the public health check must not describe the deployment's security configuration. */
describe.skipIf(!dbEnabled)("GET /api/health", () => {
  it("gives anonymous callers status and a warning count only", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(apiRequest("/api/health", { origin: null }));
    const body = await res.json();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ status: "ok", db: "ok" });
    expect(typeof body.warningCount).toBe("number");
    expect(body).not.toHaveProperty("warnings");
  });

  it("refuses the warning texts for a wrong secret and returns them for the cron secret", async () => {
    const { GET } = await import("@/app/api/health/route");
    const wrong = await (await GET(apiRequest("/api/health", { origin: null, headers: { authorization: "Bearer not-the-secret" } }))).json();
    expect(wrong).not.toHaveProperty("warnings");
    const secret = process.env.CRON_SECRET;
    expect(secret, "test env must define a local CRON_SECRET").toBeTruthy();
    const ok = await (await GET(apiRequest("/api/health", { origin: null, headers: { authorization: `Bearer ${secret}` } }))).json();
    expect(Array.isArray(ok.warnings)).toBe(true);
    expect(ok.warnings.length).toBe(ok.warningCount);
  });
});

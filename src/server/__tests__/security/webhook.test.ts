import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { assertDisposableDb, dbEnabled, runId, syntheticPhone } from "../helpers/fixtures";

/**
 * F03 / H03 — POST /api/webhooks/whatsapp, route level, against the local
 * disposable Postgres. Every request is synthetic: no Meta traffic, no real
 * phone numbers, a locally generated signing secret.
 *
 * Policy under test (user decision, 00-approval-and-baseline.md):
 *   - missing / malformed / wrong signature → 401 and NOTHING stored
 *   - webhook secret not configured        → 503 and nothing stored (Meta retries)
 *   - body over the 1 MB ceiling           → 413, nothing stored, whatever Content-Length says
 *   - body read aborted by the client      → 400, nothing stored
 *   - valid signature                      → stored once, processed once, retries deduplicated
 */

const run = runId();
const SECRET = `terra-synthetic-webhook-secret-${run}`;
const URL_PATH = "http://localhost:3000/api/webhooks/whatsapp";
const enc = new TextEncoder();

type Prisma = typeof import("@/server/lib/db").prisma;
let prisma: Prisma;
let resetEnvCache: () => void;
let POST: (req: NextRequest) => Promise<Response>;
let resetRejections: (() => void) | undefined;
const startedAt = new Date();
const savedEnv = { secret: process.env.WHATSAPP_WEBHOOK_SECRET, trust: process.env.TRUST_PROXY_IP_HEADERS };

function sign(body: Uint8Array | string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function webhookRequest(body: BodyInit, opts: { signature?: string | null; headers?: Record<string, string> } = {}): NextRequest {
  const headers = new Headers({ "content-type": "application/json", ...(opts.headers ?? {}) });
  if (opts.signature) headers.set("x-hub-signature-256", opts.signature);
  return new NextRequest(URL_PATH, { method: "POST", headers, body, duplex: "half" } as unknown as ConstructorParameters<typeof NextRequest>[1]);
}

/** A body of `total` bytes delivered in chunks with no Content-Length. */
function chunkedStream(total: number, chunk = 64 * 1024): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= total) return c.close();
      const n = Math.min(chunk, total - sent);
      sent += n;
      c.enqueue(new Uint8Array(n).fill(0x20));
    },
  });
}

/** Sends one chunk, then fails the stream the way a dropped client connection does. */
function abortingStream(first: Uint8Array): ReadableStream<Uint8Array> {
  let n = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (n++ === 0) c.enqueue(first);
      else c.error(new Error("client aborted"));
    },
  });
}

function envelope(opts: { messages?: unknown[]; statuses?: unknown[] }) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: `zz-sec-${run}`, changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages: opts.messages ?? [], statuses: opts.statuses ?? [] } }] }],
  };
}

const rows = () => prisma.webhookEvent.count({ where: { provider: "whatsapp" } });
const unverifiedRows = () => prisma.webhookEvent.count({ where: { provider: "whatsapp", OR: [{ signatureValid: false }, { providerEventId: { startsWith: "unverified:" } }] } });

async function setSecret(value: string | undefined) {
  if (value === undefined) process.env.WHATSAPP_WEBHOOK_SECRET = "";
  else process.env.WHATSAPP_WEBHOOK_SECRET = value;
  resetEnvCache();
}

describe.skipIf(!dbEnabled)("POST /api/webhooks/whatsapp (F03/H03)", () => {
  beforeAll(async () => {
    assertDisposableDb();
    prisma = (await import("@/server/lib/db")).prisma;
    ({ resetEnvCache } = await import("@/server/lib/env"));
    ({ POST } = await import("@/app/api/webhooks/whatsapp/route"));
    const mod = (await import("@/server/notifications/whatsapp-webhook")) as { __resetWebhookRejectionState?: () => void };
    resetRejections = mod.__resetWebhookRejectionState;
    delete process.env.TRUST_PROXY_IP_HEADERS;
    await setSecret(SECRET);
  });

  afterEach(() => {
    resetRejections?.();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.webhookEvent.deleteMany({ where: { provider: "whatsapp", receivedAt: { gte: startedAt } } });
    await prisma.notification.deleteMany({ where: { event: `ZZ_SEC_${run}` } });
    // consents are append-only (DB trigger); the synthetic-number rows stay in the disposable DB.
    if (savedEnv.trust === undefined) delete process.env.TRUST_PROXY_IP_HEADERS;
    else process.env.TRUST_PROXY_IP_HEADERS = savedEnv.trust;
    process.env.WHATSAPP_WEBHOOK_SECRET = savedEnv.secret ?? "";
    resetEnvCache();
  });

  const validJson = JSON.stringify(envelope({ messages: [{ from: "919900000000", id: `wamid.zz-sec-${run}-unsigned`, timestamp: "1757850000", type: "text", text: { body: "STOP" } }] }));
  const invalidJson = `{"object":"whatsapp_business_account","entry":[ not json ${run}`;
  const badSignatures: Record<string, (body: string) => string | null> = {
    missing: () => null,
    "wrong secret": (b) => sign(b, "not-the-configured-secret"),
    "signature of another body": (b) => sign(`${b} `),
    "malformed hex": () => "sha256=zzzz",
    "wrong algorithm": (b) => `sha1=${createHmac("sha1", SECRET).update(b).digest("hex")}`,
    "bare digest without prefix, truncated": (b) => sign(b).slice(7, 40),
  };

  for (const [label, makeSig] of Object.entries(badSignatures)) {
    for (const [kind, body] of [["valid JSON", validJson], ["invalid JSON", invalidJson]] as const) {
      it(`${label} signature + ${kind} → 401 and zero rows`, async () => {
        const before = await rows();
        const res = await POST(webhookRequest(body, { signature: makeSig(body) }));
        expect(res.status).toBe(401);
        expect(await rows()).toBe(before);
        expect(await unverifiedRows()).toBe(0);
      });
    }
  }

  it("absent webhook secret → 503 and zero rows, even with a signature", async () => {
    await setSecret(undefined);
    try {
      const before = await rows();
      const res = await POST(webhookRequest(validJson, { signature: sign(validJson) }));
      expect(res.status).toBe(503);
      expect(await rows()).toBe(before);
    } finally {
      await setSecret(SECRET);
    }
  });

  it("a short signed body is accepted", async () => {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [], note: `zz-sec-${run}` });
    const res = await POST(webhookRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(200);
  });

  it("over-limit body with an honest Content-Length → 413, zero rows", async () => {
    const big = new Uint8Array(1_000_001).fill(0x20);
    const before = await rows();
    const res = await POST(webhookRequest(big, { signature: sign(big), headers: { "content-length": String(big.byteLength) } }));
    expect(res.status).toBe(413);
    expect(await rows()).toBe(before);
  });

  it("over-limit streamed body without Content-Length → 413, zero rows", async () => {
    const before = await rows();
    const res = await POST(webhookRequest(chunkedStream(1_100_000), { signature: sign("x") }));
    expect(res.status).toBe(413);
    expect(await rows()).toBe(before);
  });

  it("over-limit streamed body with a false, small Content-Length → 413, zero rows", async () => {
    const before = await rows();
    const res = await POST(webhookRequest(chunkedStream(1_100_000), { signature: sign("x"), headers: { "content-length": "100" } }));
    expect(res.status).toBe(413);
    expect(await rows()).toBe(before);
  });

  it("client abort mid-body → 400, zero rows", async () => {
    const before = await rows();
    const res = await POST(webhookRequest(abortingStream(enc.encode(validJson.slice(0, 20))), { signature: sign(validJson) }));
    expect(res.status).toBe(400);
    expect(await rows()).toBe(before);
  });

  it("valid signature + invalid JSON → acknowledged (200), nothing stored", async () => {
    const before = await rows();
    const res = await POST(webhookRequest(invalidJson, { signature: sign(invalidJson) }));
    expect(res.status).toBe(200);
    expect(await rows()).toBe(before);
  });

  describe("valid signed delivery", () => {
    const phone = syntheticPhone(run, 7);
    const msgId = `wamid.zz-sec-${run}-stop`;
    const outId = `wamid.zz-sec-${run}-out`;
    const body = JSON.stringify(
      envelope({
        messages: [{ from: phone.slice(1), id: msgId, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "STOP" } }],
        statuses: [{ id: outId, status: "delivered", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: phone.slice(1) }],
      }),
    );
    const consents = () => prisma.consent.count({ where: { phoneE164: phone, source: "stop_keyword", granted: false } });

    it("STOP message + delivery status are stored and processed once", async () => {
      const { uuidv7 } = await import("@/server/lib/ids");
      await prisma.notification.create({ data: { id: uuidv7(), event: `ZZ_SEC_${run}`, channel: "whatsapp", recipient: phone, status: "sent", providerId: outId } });
      const before = await rows();
      const res = await POST(webhookRequest(body, { signature: sign(body) }));
      expect(res.status).toBe(200);
      expect(await rows()).toBe(before + 2);
      const stored = await prisma.webhookEvent.findMany({ where: { providerEventId: { in: [`msg:${msgId}`, `status:${outId}:delivered`] } } });
      expect(stored).toHaveLength(2);
      for (const r of stored) {
        expect(r.signatureValid).toBe(true);
        expect(r.processedAt).not.toBeNull();
        expect(r.processingError).toBeNull();
      }
      expect(await consents()).toBe(2);
      const n = await prisma.notification.findFirst({ where: { providerId: outId } });
      expect(n?.status).toBe("delivered");
    });

    it("the provider's retry of the same delivery is deduplicated", async () => {
      const before = await rows();
      const res = await POST(webhookRequest(body, { signature: sign(body) }));
      expect(res.status).toBe(200);
      expect(await rows()).toBe(before);
      expect(await consents()).toBe(2);
    });
  });

  it("an invalid delivery does not block the later valid delivery of the same body", async () => {
    const body = JSON.stringify(envelope({ statuses: [{ id: `wamid.zz-sec-${run}-later`, status: "read", timestamp: "1757850009" }] }));
    const before = await rows();
    const bad = await POST(webhookRequest(body, { signature: sign(body, "attacker-guess") }));
    expect(bad.status).toBe(401);
    expect(await rows()).toBe(before);
    const good = await POST(webhookRequest(body, { signature: sign(body) }));
    expect(good.status).toBe(200);
    expect(await rows()).toBe(before + 1);
    const row = await prisma.webhookEvent.findFirst({ where: { providerEventId: `status:wamid.zz-sec-${run}-later:read` } });
    expect(row?.processedAt).not.toBeNull();
  });

  describe("rejection telemetry and abuse budget", () => {
    it("logs bounded, redacted metadata for a rejection — never the signature, body or secret", async () => {
      const { log } = await import("@/server/lib/logger");
      const warn = vi.spyOn(log, "warn");
      const sig = sign(validJson, "attacker-guess");
      await POST(webhookRequest(validJson, { signature: sig }));
      const calls = warn.mock.calls.filter(([msg]) => String(msg).startsWith("whatsapp.webhook"));
      expect(calls).toHaveLength(1);
      const serialised = JSON.stringify(calls[0]);
      expect(serialised).not.toContain(sig.slice(7));
      expect(serialised).not.toContain("STOP");
      expect(serialised).not.toContain(SECRET);
      expect(calls[0][1]).toMatchObject({ reason: "signature_mismatch", bytes: enc.encode(validJson).byteLength });
      expect(String((calls[0][1] as { bodyHash: string }).bodyHash)).toMatch(/^[0-9a-f]{16}$/);
    });

    it("samples rejection logs: the first and then every Nth per window, with a suppressed count", async () => {
      const mod = await import("@/server/notifications/whatsapp-webhook");
      const { log } = await import("@/server/lib/logger");
      const warn = vi.spyOn(log, "warn");
      const every = mod.REJECTION_LOG_EVERY;
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      try {
        for (let i = 0; i <= every; i++) {
          // Spread across many trusted IPs so the per-IP budget is not what is being measured.
          const ip = `198.51.${100 + Math.floor(i / 200)}.${(i % 200) + 1}`;
          await POST(webhookRequest("{}", { signature: null, headers: { "x-real-ip": ip } }));
        }
      } finally {
        delete process.env.TRUST_PROXY_IP_HEADERS;
      }
      const calls = warn.mock.calls.filter(([msg]) => msg === "whatsapp.webhook.rejected");
      expect(calls).toHaveLength(2);
      expect(calls[1][1]).toMatchObject({ reason: "signature_missing", suppressed: every - 1 });
    });

    it("refuses an IP that exceeds its rejection budget with 429, and the budget cannot be reset by changing headers", async () => {
      const mod = await import("@/server/notifications/whatsapp-webhook");
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      try {
        const ip = "203.0.113.50";
        for (let i = 0; i < mod.REJECTION_BUDGET_PER_IP; i++) {
          const res = await POST(webhookRequest(validJson, { signature: sign(`${i}`), headers: { "x-real-ip": ip } }));
          expect(res.status).toBe(401);
        }
        const over = await POST(webhookRequest(validJson, { signature: "sha256=" + "a".repeat(64), headers: { "x-real-ip": ip, "x-forwarded-for": "192.0.2.1" } }));
        expect(over.status).toBe(429);
        expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
        // Another trusted IP is unaffected.
        const other = await POST(webhookRequest(validJson, { signature: null, headers: { "x-real-ip": "203.0.113.51" } }));
        expect(other.status).toBe(401);
        // Valid provider traffic from the exhausted IP is never limited by the rejection budget.
        const body = JSON.stringify(envelope({ statuses: [{ id: `wamid.zz-sec-${run}-budget`, status: "sent", timestamp: "1757850010" }] }));
        const before = await rows();
        const valid = await POST(webhookRequest(body, { signature: sign(body), headers: { "x-real-ip": ip } }));
        expect(valid.status).toBe(200);
        expect(await rows()).toBe(before + 1);
      } finally {
        delete process.env.TRUST_PROXY_IP_HEADERS;
      }
    });

    it("the rejection budget resets after its window", async () => {
      const mod = await import("@/server/notifications/whatsapp-webhook");
      process.env.TRUST_PROXY_IP_HEADERS = "true";
      const t0 = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
      try {
        const ip = "203.0.113.60";
        for (let i = 0; i < mod.REJECTION_BUDGET_PER_IP; i++) await POST(webhookRequest("{}", { headers: { "x-real-ip": ip } }));
        expect((await POST(webhookRequest("{}", { headers: { "x-real-ip": ip } }))).status).toBe(429);
        clock.mockReturnValue(t0 + mod.REJECTION_WINDOW_MS + 1);
        expect((await POST(webhookRequest("{}", { headers: { "x-real-ip": ip } }))).status).toBe(401);
      } finally {
        delete process.env.TRUST_PROXY_IP_HEADERS;
      }
    });
  });
});

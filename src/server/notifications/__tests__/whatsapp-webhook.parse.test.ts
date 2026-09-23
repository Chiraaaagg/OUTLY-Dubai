import { describe, expect, it } from "vitest";
import { isStopKeyword, parseWhatsAppWebhook, providerEventIdOf, signMetaPayload, toE164, verifyMetaSignature } from "../whatsapp-webhook.parse";

const SECRET = "test-app-secret";

const envelope = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1234567890",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "919000000001", phone_number_id: "111" },
            contacts: [{ profile: { name: "Priya <b>S</b>" }, wa_id: "919876543210" }],
            messages: [
              { from: "919876543210", id: "wamid.MSG1", timestamp: "1757850000", type: "text", text: { body: "STOP" } },
              { from: "919876543210", id: "wamid.MSG2", timestamp: "1757850001", type: "image", image: { id: "img", caption: "see this" }, referral: { source_url: "https://fb.com/ad", source_id: "ad1", source_type: "ad", ctwa_clid: "clid-1" } },
            ],
            statuses: [
              { id: "wamid.OUT1", status: "delivered", timestamp: "1757850002", recipient_id: "919876543210", conversation: { id: "conv1" }, pricing: { billable: true, category: "utility", pricing_model: "PMP" } },
              { id: "wamid.OUT1", status: "read", timestamp: "1757850003", recipient_id: "919876543210" },
              { id: "wamid.OUT2", status: "failed", timestamp: 1757850004, recipient_id: "919876543210", errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "Recipient not on WhatsApp" } }] },
            ],
          },
        },
      ],
    },
  ],
};

describe("verifyMetaSignature", () => {
  const body = JSON.stringify(envelope);

  it("accepts a correct sha256= header and rejects everything else", () => {
    const header = signMetaPayload(body, SECRET);
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyMetaSignature(body, header, SECRET)).toBe(true);
    expect(verifyMetaSignature(body, header.toUpperCase().replace("SHA256=", "sha256="), SECRET)).toBe(true);
    expect(verifyMetaSignature(body, header, "other-secret")).toBe(false);
    expect(verifyMetaSignature(`${body} `, header, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=notahex", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, header, "")).toBe(false);
  });

  it("is computed over the raw bytes, not a re-serialised object", () => {
    const pretty = JSON.stringify(envelope, null, 2);
    expect(verifyMetaSignature(pretty, signMetaPayload(body, SECRET), SECRET)).toBe(false);
    expect(verifyMetaSignature(pretty, signMetaPayload(pretty, SECRET), SECRET)).toBe(true);
  });
});

describe("parseWhatsAppWebhook", () => {
  it("flattens messages and statuses with dedup keys", () => {
    const parsed = parseWhatsAppWebhook(envelope);
    expect(parsed.object).toBe("whatsapp_business_account");
    expect(parsed.items).toHaveLength(5);

    const [m1, m2, s1, s2, s3] = parsed.items;
    expect(m1.kind).toBe("message");
    if (m1.kind !== "message") throw new Error();
    expect(m1.from).toBe("+919876543210");
    expect(m1.text).toBe("STOP");
    expect(m1.profileName).toBe("Priya <b>S</b>");
    expect(m1.timestamp.toISOString()).toBe("2025-09-14T11:40:00.000Z");
    expect(providerEventIdOf(m1)).toBe("msg:wamid.MSG1");

    if (m2.kind !== "message") throw new Error();
    expect(m2.type).toBe("image");
    expect(m2.text).toBe("see this");
    expect(m2.referral?.ctwaClid).toBe("clid-1");

    if (s1.kind !== "status" || s2.kind !== "status" || s3.kind !== "status") throw new Error();
    expect(providerEventIdOf(s1)).toBe("status:wamid.OUT1:delivered");
    expect(providerEventIdOf(s2)).toBe("status:wamid.OUT1:read");
    expect(s1.pricing).toEqual({ billable: true, category: "utility", pricingModel: "PMP" });
    expect(s1.conversationId).toBe("conv1");
    expect(s3.status).toBe("failed");
    expect(s3.error).toBe("Message undeliverable: Recipient not on WhatsApp");
    expect(s3.timestamp.toISOString()).toBe("2025-09-14T11:40:04.000Z");
  });

  it("keeps the raw provider object for persistence", () => {
    const [m1] = parseWhatsAppWebhook(envelope).items;
    expect(m1.raw).toEqual(envelope.entry[0].changes[0].value.messages[0]);
  });

  it("tolerates garbage without throwing", () => {
    expect(parseWhatsAppWebhook(null).items).toEqual([]);
    expect(parseWhatsAppWebhook("str").items).toEqual([]);
    expect(parseWhatsAppWebhook({ entry: "nope" }).items).toEqual([]);
    expect(parseWhatsAppWebhook({ entry: [{ changes: [{ value: { messages: [{ id: 1 }] } }] }] }).items).toEqual([]);
    expect(parseWhatsAppWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] }).items).toEqual([]);
  });

  it("caps text length and normalises status case", () => {
    const parsed = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: { messages: [{ id: "m", from: "1", type: "text", text: { body: "x".repeat(9000) } }], statuses: [{ id: "s", status: "DELIVERED" }] } }] }],
    });
    const [m, s] = parsed.items;
    if (m.kind !== "message" || s.kind !== "status") throw new Error();
    expect(m.text).toHaveLength(4000);
    expect(s.status).toBe("delivered");
  });
});

describe("STOP keyword (§08.7)", () => {
  it("matches whole-message stop/unsubscribe only", () => {
    expect(isStopKeyword("STOP")).toBe(true);
    expect(isStopKeyword("  stop \n")).toBe(true);
    expect(isStopKeyword("Unsubscribe")).toBe(true);
    expect(isStopKeyword("please stop messaging me")).toBe(false);
    expect(isStopKeyword("stop!")).toBe(false);
    expect(isStopKeyword("")).toBe(false);
    expect(isStopKeyword(undefined)).toBe(false);
  });

  it("toE164 adds the plus and strips formatting", () => {
    expect(toE164("919876543210")).toBe("+919876543210");
    expect(toE164("+91 98765-43210")).toBe("+919876543210");
    expect(toE164("")).toBe("");
  });
});

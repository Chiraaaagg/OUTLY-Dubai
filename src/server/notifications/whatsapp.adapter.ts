import "server-only";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { positionalParameters } from "./whatsapp-templates";

/**
 * WhatsApp Business Platform transport — DEFERRED (§18 §1.4, Phase B).
 *
 * The port is fixed here so the notification service never changes when the
 * BSP arrives. Two adapters:
 *  - `log`       — records the message; returns a `log-` provider id. Default.
 *  - `cloud_api` — Meta Cloud API shape (also what Wati/Interakt/AiSensy
 *                  expose or proxy). Selected by WHATSAPP_PROVIDER=cloud_api
 *                  and refuses to start without credentials.
 *
 * TODO(whatsapp-bsp): once credentials + approved templates exist:
 *   1. Set WHATSAPP_PROVIDER=cloud_api, WHATSAPP_API_BASE_URL, WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
 *   2. Confirm template names in WHATSAPP_TEMPLATE_* match the approved names.
 *   3. Delivery receipts already flow through /api/webhooks/whatsapp →
 *      notifications.delivered_at (see whatsapp-webhook.ts); confirm the BSP
 *      forwards `statuses` unchanged.
 *   4. Record `cost_minor` from the BSP rate card per message (§08.2).
 *   5. Consult wa_conversations.csw_expires_at before choosing template vs
 *      session message (§08.2) — until then every send is a template.
 */

export interface WhatsAppSend {
  to: string; // E.164
  templateName?: string;
  variables: Record<string, string>;
  text: string;
}

export interface SendResult {
  providerId: string;
  costMinor?: bigint;
}

async function sendViaCloudApi(msg: WhatsAppSend): Promise<SendResult> {
  const e = env();
  if (!e.WHATSAPP_API_BASE_URL || !e.WHATSAPP_API_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WHATSAPP_PROVIDER=cloud_api but WHATSAPP_API_BASE_URL / WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID are missing");
  }
  if (!msg.templateName) throw new Error("Session (non-template) messages need an open customer service window — not tracked yet");
  const parameters = positionalParameters(msg.variables);
  if (!parameters.length) throw new Error(`Template ${msg.templateName} has no body parameters`);

  const body = {
    messaging_product: "whatsapp",
    to: msg.to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: msg.templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: parameters.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${e.WHATSAPP_API_BASE_URL.replace(/\/$/, "")}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.WHATSAPP_API_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WhatsApp API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    return { providerId: data.messages?.[0]?.id ?? "whatsapp" };
  } finally {
    clearTimeout(timer);
  }
}

export const whatsappAdapter = {
  provider(): "cloud_api" | "log" {
    return env().WHATSAPP_PROVIDER;
  },
  async send(msg: WhatsAppSend): Promise<SendResult> {
    if (whatsappAdapter.provider() === "cloud_api") return sendViaCloudApi(msg);
    log.info("whatsapp.log_adapter", { template: msg.templateName, variables: Object.keys(msg.variables).length, chars: msg.text.length });
    return { providerId: `log-${Date.now().toString(36)}` };
  },
};

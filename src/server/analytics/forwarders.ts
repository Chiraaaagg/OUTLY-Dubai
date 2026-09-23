import "server-only";
import { env } from "../lib/env";
import { log } from "../lib/logger";

/**
 * Downstream analytics destinations (§11.5) — a port with one adapter per
 * destination. All three are DEFERRED at launch. Each adapter is an honest
 * no-op: `enabled()` reports whether credentials exist, `forward()` logs
 * once per process that the adapter is not implemented and returns. Nothing
 * here ever fakes a delivery, and nothing here is ever the source of truth —
 * `analytics_events` is (§11.1).
 *
 * Privacy invariants that every future adapter must keep (§11.9, §13.7.1):
 *  - `analyticsService` strips dietary / accessibility / special_requests /
 *    contact fields before an event reaches this port. Do not re-fetch them.
 *  - PII used for matching (email, phone) is SHA-256 hashed after
 *    normalisation before it is placed in any request body.
 *  - Non-production events are never forwarded (`forwarders.forward` gate).
 *
 * ---------------------------------------------------------------------------
 * TODO(meta-capi): Conversions API adapter.
 *   Endpoint: POST https://graph.facebook.com/v21.0/{META_DATASET_ID}/events
 *             ?access_token={META_CAPI_ACCESS_TOKEN}
 *   Body: { data: [MetaEvent], test_event_code?: META_CAPI_TEST_EVENT_CODE }
 *   MetaEvent = {
 *     event_name, event_time (unix seconds of occurredAt), event_id (ours —
 *     AC-META-01 dedup against the Pixel), action_source: "website",
 *     event_source_url (props.page_path joined to NEXT_PUBLIC_SITE_URL),
 *     user_data: { client_ip_address?, client_user_agent?, fbp?, fbc?,
 *                  em?: [sha256(lowercased email)], ph?: [sha256(E.164 digits)] },
 *     custom_data: { value, currency, content_ids?, content_type: "product" }
 *   }
 *   Event mapping for inquiry mode (§17 §5.3):
 *     activity_viewed    -> ViewContent      (content_ids: [productSlug], value: price)
 *     search_submitted   -> Search
 *     inquiry_item_added -> AddToCart        (also add_to_cart)
 *     inquiry_started    -> InitiateCheckout
 *     inquiry_submitted  -> Lead             (value = indicative cart total in
 *                                            major units = valueMinor / 100,
 *                                            currency = "INR"; server-emitted)
 *     whatsapp_initiated -> Lead             (client + server mirror, same event_id)
 *     booking_confirmed  -> Purchase         (NOT sent through CAPI in inquiry
 *                                            mode: the purchase happens offline,
 *                                            days later, on a payment link. It is
 *                                            uploaded by the offline conversions
 *                                            job instead — see
 *                                            `offline-conversions.ts`. Sending it
 *                                            here as well would double count.)
 *   user_data for server events comes from the inquiry row (email/phone hashed);
 *   fbc/fbp from `inquiries.attribution`. Only where consent permits.
 *   On success set `analytics_events.forwarded_meta = true`.
 *
 * TODO(posthog): POST https://{NEXT_PUBLIC_POSTHOG_HOST}/capture/
 *   { api_key: NEXT_PUBLIC_POSTHOG_KEY, event: name, distinct_id: anonId ?? sessionId,
 *     timestamp: occurredAt ISO, properties: { $session_id: sessionId, ...scrubbed props,
 *     rail, tier, value: valueMinor/100, currency, inquiry_id, order_id, $lib: "outlyy-server" } }
 *   Server events with no anonId use `inquiry_id` as distinct_id and are
 *   aliased to the anon id when the inquiry row carries one.
 *   On success set `forwarded_posthog = true`.
 *
 * TODO(ga4): Measurement Protocol
 *   POST https://www.google-analytics.com/mp/collect
 *        ?measurement_id={NEXT_PUBLIC_GA4_MEASUREMENT_ID}&api_secret={GA4_API_SECRET}
 *   { client_id: anonId, timestamp_micros, non_personalized_ads: true,
 *     events: [{ name, params: { session_id, engagement_time_msec: 1, value, currency, ...scrubbed props } }] }
 *   Mapping: activity_viewed -> view_item, inquiry_item_added/add_to_cart -> add_to_cart,
 *   inquiry_started -> begin_checkout, inquiry_submitted -> generate_lead,
 *   booking_confirmed -> purchase (transaction_id = order reference).
 *   On success set `forwarded_ga4 = true`.
 * ---------------------------------------------------------------------------
 */

export interface ForwardableEvent {
  name: string;
  eventId: string;
  source: "client" | "server";
  environment: string;
  occurredAt?: Date;
  inquiryId?: string;
  orderId?: string;
  productSlug?: string;
  rail?: string;
  tier?: string;
  valueMinor?: bigint;
  currency?: string;
  sessionId?: string;
  anonId?: string;
  props?: Record<string, unknown>;
}

export interface Forwarder {
  readonly name: string;
  enabled(): boolean;
  forward(event: ForwardableEvent): Promise<void>;
}

/**
 * Meta standard event for one of ours, or null when the event has no Meta
 * meaning. Exported so the CAPI adapter and the offline job share one table.
 */
export function metaEventName(name: string): "ViewContent" | "Search" | "AddToCart" | "InitiateCheckout" | "Lead" | "Purchase" | null {
  switch (name) {
    case "activity_viewed":
      return "ViewContent";
    case "search_submitted":
      return "Search";
    case "inquiry_item_added":
    case "add_to_cart":
      return "AddToCart";
    case "inquiry_started":
    case "checkout_started":
      return "InitiateCheckout";
    case "inquiry_submitted":
    case "whatsapp_initiated":
      return "Lead";
    case "booking_confirmed":
      return "Purchase";
    default:
      return null;
  }
}

/** Log the "not implemented" warning once per adapter per process, not once per event. */
const warned = new Set<string>();
function warnOnce(adapter: string) {
  if (warned.has(adapter)) return;
  warned.add(adapter);
  log.warn(`analytics.${adapter}.not_implemented`, { note: "credentials present, adapter is a no-op — see TODO in forwarders.ts" });
}

const metaCapi: Forwarder = {
  name: "meta_capi",
  enabled: () => Boolean(env().META_CAPI_ACCESS_TOKEN && env().META_DATASET_ID),
  async forward(event) {
    // TODO(meta-capi): implement per the header note. Purchase is deliberately
    // excluded here in inquiry mode (offline upload owns it).
    if (metaEventName(event.name) === null || event.name === "booking_confirmed") return;
    warnOnce("meta_capi");
  },
};

const posthog: Forwarder = {
  name: "posthog",
  enabled: () => Boolean(env().NEXT_PUBLIC_POSTHOG_KEY),
  async forward() {
    // TODO(posthog): implement per the header note.
    warnOnce("posthog");
  },
};

const ga4: Forwarder = {
  name: "ga4",
  enabled: () => Boolean(env().GA4_API_SECRET && env().NEXT_PUBLIC_GA4_MEASUREMENT_ID),
  async forward() {
    // TODO(ga4): implement per the header note.
    warnOnce("ga4");
  },
};

const ALL: Forwarder[] = [metaCapi, posthog, ga4];

export const forwarders = {
  /**
   * Fan out to every enabled destination. Never throws; never awaited by the
   * request path (callers `void` it). Staging/dev events are never forwarded
   * to ad platforms (§11.8) — the `environment` tag is the gate.
   */
  async forward(event: ForwardableEvent) {
    if (event.environment !== "production") return;
    for (const f of ALL) {
      if (!f.enabled()) continue;
      try {
        await f.forward(event);
      } catch (error) {
        log.warn("analytics.forwarder_error", { forwarder: f.name, error });
      }
    }
  },
  list: () => ALL.map((f) => ({ name: f.name, enabled: f.enabled(), implemented: false })),
};

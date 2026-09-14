/**
 * Analytics facade.
 *
 * PRD §8 requires server-side tracking as the source of truth (client-only
 * under-reports 20–40%). This module is the *client* half only: it normalises
 * the event name and properties, pushes to `window.dataLayer`, and posts to
 * `/api/events` with a stable `event_id` so the server can deduplicate against
 * Meta CAPI (AC-META-01).
 *
 * INTEGRATION BOUNDARY — swap `deliver()` for GTM / Segment / a first-party
 * collector. Nothing else in the app should know how events are transported.
 */

import type { Rail, Tier } from "./types";

export type AnalyticsEvent =
  // Acquisition & discovery
  | "page_view"
  | "landing_page_view"
  | "search_started"
  | "search_submitted"
  | "search_suggestion_selected"
  | "filter_applied"
  | "sort_applied"
  | "activity_card_viewed"
  | "activity_viewed"
  | "activity_compared"
  | "activity_saved"
  // Booking intent
  | "date_selected"
  | "time_selected"
  | "guest_count_changed"
  | "variant_selected"
  | "add_to_cart"
  | "checkout_started"
  | "checkout_field_error"
  | "coupon_applied"
  | "coupon_rejected"
  | "payment_method_selected"
  | "payment_initiated"
  | "payment_completed"
  | "payment_failed"
  | "supplier_confirmation_pending"
  | "booking_confirmed"
  // Post-booking
  | "voucher_downloaded"
  | "voucher_sent_whatsapp"
  | "booking_modified"
  | "booking_cancelled"
  | "review_submitted"
  | "referral_clicked"
  // Inquiry mode — `inquiry_submitted` is the primary site conversion and maps
  // to Meta `Lead`; `booking_confirmed` remains the business conversion and is
  // uploaded offline when an agent wins the inquiry (pivot plan §5.3)
  | "inquiry_started"
  | "inquiry_item_added"
  | "inquiry_submitted"
  | "inquiry_field_error"
  | "inquiry_whatsapp_alternative"
  // Assisted rail — a conversion event, not an engagement event (PRD §8)
  | "whatsapp_initiated"
  | "support_contacted"
  | "quote_requested"
  // Resilience
  | "error_shown"
  | "empty_state_shown"
  | "retry_clicked";

export interface EventProps {
  activity_id?: string;
  activity_slug?: string;
  activity_category?: string;
  tier?: Tier;
  combo_slug?: string;
  landing_page?: string;
  page_type?: string;
  user_segment?: "fit" | "expat" | "unknown";
  device_type?: "mobile" | "tablet" | "desktop";
  traffic_source?: string;
  selected_date?: string;
  selected_time?: string;
  guest_count?: number;
  pax_breakdown?: string;
  price?: number;
  currency?: string;
  value?: number;
  payment_method?: string;
  booking_status?: string;
  booking_reference?: string;
  inquiry_reference?: string;
  inquiry_source?: string;
  fulfilment_mode?: "inquiry" | "instant";
  item_count?: number;
  rail?: Rail;
  whatsapp_context?: string;
  filters?: string;
  result_count?: number;
  has_dietary_filter?: boolean;
  sort?: string;
  position?: number;
  failure_reason?: string;
  field?: string;
  coupon?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    __outlyEvents?: { name: string; props: EventProps; at: number }[];
  }
}

function deviceType(): EventProps["device_type"] {
  if (typeof window === "undefined") return undefined;
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function eventId(name: string): string {
  return `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fire an analytics event. Safe to call during render-adjacent effects; never
 * throws, never blocks. Server-side truth is posted best-effort.
 */
export function track(name: AnalyticsEvent, props: EventProps = {}): void {
  if (typeof window === "undefined") return;

  const payload = {
    event: name,
    event_id: eventId(name),
    device_type: deviceType(),
    page_path: window.location.pathname,
    ts: Date.now(),
    ...props,
  };

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);

  // In-memory ring buffer: powers the /design-system analytics inspector and
  // makes events assertable in end-to-end tests without a network stub.
  window.__outlyEvents = window.__outlyEvents ?? [];
  window.__outlyEvents.push({ name, props, at: payload.ts });
  if (window.__outlyEvents.length > 200) window.__outlyEvents.shift();

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", name, props);
  }

  deliver(payload);
}

function deliver(payload: Record<string, unknown>) {
  // MOCK: no collector wired yet. Real implementation posts to our own
  // endpoint, which forwards to Meta CAPI + the warehouse server-side.
  if (!process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT) return;
  try {
    navigator.sendBeacon?.(
      process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT,
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
    );
  } catch {
    /* analytics must never break a booking */
  }
}

/** Read the client-side buffer (debug tooling only). */
export function recentEvents() {
  if (typeof window === "undefined") return [];
  return window.__outlyEvents ?? [];
}

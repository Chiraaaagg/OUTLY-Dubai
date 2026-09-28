"use client";

import { useEffect } from "react";
import { getConsent, onConsentChange, type ConsentChoice } from "@/lib/consent";

/**
 * Consent relay for the Google tag.
 *
 * This component used to load gtag.js. It no longer does — the tag lives in the
 * document head for every page (`src/lib/google-tag.ts`), because Google's
 * verifier reads the served HTML and a script injected after hydration, only
 * once a consent cookie exists, is invisible to it. Loading it here as well
 * would put two Google tags on the page, which Google's instructions
 * explicitly warn against.
 *
 * What is left is the half that has to be client-side: reading the stored
 * decision and telling the already-running tag about it.
 *
 * Consent Mode v2 mapping:
 *   our `measurement` → analytics_storage
 *   our `marketing`   → ad_storage, ad_user_data, ad_personalization
 *
 * The head snippet queues `consent: default` with all four denied and a 500ms
 * `wait_for_update`, so the update below lands before anything identifiable is
 * sent. A withdrawal pushes everything back to denied; GA stops writing cookies
 * immediately and the banner's own cleanup removes the ones already set.
 *
 * Still storefront-only at the call site in the root layout: under /admin the
 * head snippet never calls `config`, so no measurement stream is opened on
 * screens showing customer PII.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type ConsentValue = "granted" | "denied";

function signals(consent: ConsentChoice | null) {
  const measurement: ConsentValue = consent?.measurement ? "granted" : "denied";
  const marketing: ConsentValue = consent?.marketing ? "granted" : "denied";
  return {
    analytics_storage: measurement,
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
  };
}

/** Pushes through `dataLayer` directly, so it works whether or not gtag.js has arrived. */
function push(...args: unknown[]) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  // gtag's own snippet pushes `arguments`, not an array — the shape matters.
  (window.dataLayer as unknown[]).push(args);
}

export function GoogleAnalytics() {
  useEffect(() => {
    // Read once on mount: the decision lives in a cookie the prerendered HTML
    // cannot know about, so the head snippet had to assume "denied".
    push("consent", "update", signals(getConsent()));
    return onConsentChange((next) => push("consent", "update", signals(next)));
  }, []);

  return null;
}

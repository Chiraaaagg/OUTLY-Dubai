"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getConsent, onConsentChange, type ConsentChoice } from "@/lib/consent";

/**
 * Google Analytics 4.
 *
 * Google's own instructions say to paste the tag straight after `<head>` on
 * every page. That is not what this does, for two reasons that are not
 * negotiable here:
 *
 *  1. **Consent.** GA4 writes `_ga` identifiers and, with Google signals on,
 *     feeds Google Ads. Under PECR/GDPR — and the notice this site already
 *     publishes at /cookies — none of that may happen before the visitor
 *     agrees. So gtag.js is not even requested until measurement consent
 *     exists, and Consent Mode v2 defaults are pushed to `dataLayer` *before*
 *     the library loads, so the very first GA call is already "denied".
 *  2. **The admin console.** Staff screens carry customer PII in the URL and
 *     the DOM. They are excluded, not merely unmeasured.
 *
 * Consent Mode v2 mapping:
 *   our `measurement` → analytics_storage
 *   our `marketing`   → ad_storage, ad_user_data, ad_personalization
 *
 * A withdrawal pushes `consent: update` with everything denied and reloads no
 * scripts; GA stops writing cookies immediately and the banner's own cleanup
 * removes the ones already set. The tag never loads again in that session.
 *
 * The measurement id is env-driven, so a preview deployment with no id set
 * ships no tag at all rather than polluting production analytics.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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

/** Pushes through `dataLayer` directly so it works before gtag.js has loaded. */
function push(...args: unknown[]) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  // gtag's own snippet pushes `arguments`, not an array — the shape matters.
  (window.dataLayer as unknown[]).push(args);
}

export function GoogleAnalytics() {
  const [consent, setConsentState] = useState<ConsentChoice | null | undefined>(undefined);

  useEffect(() => {
    setConsentState(getConsent());
    return onConsentChange((next) => {
      setConsentState(next);
      // Tell a tag that is already running about the change, immediately.
      push("consent", "update", signals(next));
    });
  }, []);

  // `undefined` = not read yet. Never render on the server: the decision lives
  // in a cookie the statically prerendered HTML cannot know about.
  if (!GA_ID || consent === undefined || !consent?.measurement) return null;

  return (
    <>
      {/*
        Ordering is load-bearing, and it is handled the way Google's own
        snippet handles it: every command is queued on `dataLayer` *before*
        the async library arrives, and gtag.js replays the queue when it
        loads. So the first thing GA ever sees is `consent: default` with
        everything denied, then the update for what this visitor actually
        granted — never an unknown state, even for a few milliseconds.

        (`beforeInteractive` would be the obvious way to express that, but it
        only applies to scripts present in the initial document. This
        component renders after hydration, once the consent cookie has been
        read, so Next would silently downgrade it and the defaults would
        never run.)
      */}
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('consent','default',{'analytics_storage':'denied','ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','wait_for_update':500});
gtag('consent','update',${JSON.stringify(signals(consent))});
gtag('js',new Date());
gtag('config','${GA_ID}',{'anonymize_ip':true});`}
      </Script>

      <Script id="ga-src" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
    </>
  );
}

/**
 * The Google tag, as it appears in the document head.
 *
 * Google's setup instructions say to paste gtag.js immediately after `<head>`
 * on every page, and their verifier checks the served HTML for exactly that.
 * An earlier version of this site loaded the tag from a client component after
 * hydration, and only once measurement consent existed — correct for privacy,
 * invisible to the verifier, which sees a fresh visit with no consent cookie
 * and therefore no tag at all. Hence "Google tag not detected".
 *
 * So the tag now ships in the head of every page, and the consent gate moves
 * into Consent Mode v2 instead of into whether the script exists:
 *
 *   - `consent: default` with all four signals denied is queued on `dataLayer`
 *     **before** the loader tag, so the first thing gtag.js ever sees is
 *     "denied". No `_ga` cookie, no identifiers, no ad signals.
 *   - `wait_for_update` gives the banner 500ms to say otherwise before
 *     anything is sent, so a returning visitor who already agreed is not
 *     measured as if they had not.
 *   - `src/components/analytics/google-analytics.tsx` pushes `consent: update`
 *     once the stored decision is read, and again whenever it changes.
 *
 * This is a deliberate change of posture, not an oversight: previously the
 * library was never fetched without consent, now it is fetched but starts
 * denied and sends only cookieless pings until the visitor agrees. That is the
 * mechanism Google designed for this and what /cookies describes.
 *
 * `config` is skipped under /admin. Staff screens carry customer PII in the URL
 * and the DOM, and without a `config` call gtag.js opens no measurement stream
 * and sets no cookies there. The check is inline rather than server-side
 * because reading the path on the server would make the root layout dynamic
 * and cost the whole statically prerendered catalogue.
 */

/** Queued before the loader, so the first GA call is already "denied". */
export function googleTagBootstrap(measurementId: string): string {
  return [
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}`,
    `gtag('consent','default',{'analytics_storage':'denied','ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','wait_for_update':500});`,
    `gtag('js',new Date());`,
    // Storefront only. Under /admin the library loads but is never configured.
    `if(!location.pathname.startsWith('/admin')){gtag('config','${measurementId}',{'anonymize_ip':true});}`,
  ].join("");
}

export function googleTagSrc(measurementId: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
}

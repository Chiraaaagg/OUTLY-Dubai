# Storefront Content Security Policy: current state and plan

Status: open. `'unsafe-inline'` stays on the storefront `script-src` for now. Nothing in this document is deployed yet. It covers why the policy cannot be tightened in place, and what tightening it would take.

Context: finding F01/H01 (staff-edited catalogue text broke out of `<script type="application/ld+json">`). The fix is output encoding: every JSON-LD sink goes through `serializeJsonLd` (`src/lib/json-ld.ts`), and the render test `src/app/__tests__/json-ld-render.test.ts` checks it against real pages. On the storefront, CSP is not a backstop for that class of bug today. This document explains why and what would change that.

## 1. Current policy (`src/proxy.ts`)

| Surface | `script-src` (production) | Notes |
|---|---|---|
| `/admin/**` | `'self' 'nonce-<per request>' 'strict-dynamic'` | force-dynamic, so a per-request nonce works. The CSP is also set on the request so Next stamps its own inline scripts. |
| Storefront (everything else) | `'self' 'unsafe-inline'` plus GA / MSG91 / hCaptcha hosts when those are configured | no `'unsafe-eval'` in production |
| Development | `'self' 'unsafe-inline' 'unsafe-eval'` | the toolchain needs eval |

Other directives are the same everywhere: `default-src 'self'`, `style-src 'self' 'unsafe-inline'` (+ hCaptcha), `img-src 'self' data: blob: https:`, `font-src 'self' data:`, `connect-src 'self'` (+ GA / MSG91 / hCaptcha, + `ws: wss:` in dev), `frame-src` hCaptcha (only when the OTP widget is configured), `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, `upgrade-insecure-requests`. The other headers are `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and HSTS (production). This change keeps every one of them as it is.

## 2. Why the storefront still needs `'unsafe-inline'`

These are the inline scripts on every storefront page. The list was confirmed by rendering `/categories/desert-safari` under `next dev`; a production build has the same kinds.

1. **RSC flight data**: `<script>(self.__next_f=self.__next_f||[]).push([0])</script>` and many `<script>self.__next_f.push([1,"…"])</script>`. These scripts carry the page's serialized React tree, catalogue text included, so their content differs for every page and every catalogue edit.
2. **React streaming runtime**: `$RC(…)`, `$RB=[];$RV=…`, `requestAnimationFrame(function(){$RT=…})`, and in dev `self.__next_r=…`.
3. **Our two fixed bootstraps** (`src/app/layout.tsx`): `CURRENCY_BOOTSTRAP_SCRIPT` (constant), and `googleTagBootstrap(id)` when a GA id is set (constant per build).

What the installed Next.js (16.3.4) supports:

- **Nonces** (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`, "How nonces work"): Next stamps the nonce on its framework scripts, inline flight scripts and runtime only while rendering a request. In the docs' words: "you **must use dynamic rendering to add nonces**". Static pages are generated "when no request or response headers exist—so no nonce can be injected". With nonces, "Static optimization and Incremental Static Regeneration (ISR) are disabled", and PPR is incompatible. The code agrees: `createInlinedDataReadableStream` in `next/dist/server/app-render/use-flight-response.js` writes `<script nonce="…">` only when a nonce exists, and plain `<script>` otherwise.
- **Experimental SRI** (`experimental.sri`, same doc, "Subresource Integrity"): this adds `integrity` to the **external** chunk `<script src>` tags only (`next/dist/server/app-render/required-scripts.js`). Inline flight scripts get no hash, and neither does the runtime. The doc's example policy (`script-src 'self'` with SRI) would therefore block the inline flight scripts on an App Router page. Do not rely on it without a browser test (§5).
- **Hashing the two fixed bootstraps** cannot be done alone. Under CSP Level 2 and later, once a hash or nonce source is present in `script-src`, the browser **ignores `'unsafe-inline'`**. Adding `'sha256-…'` for the currency and GA bootstraps would block every flight and runtime script, and hydration would fail on every page. Hashing the flight scripts is not possible either, because their content is per page and per edit and Next emits no hash list for them.
- A **static nonce** (the same value baked into prerendered HTML) gives no protection. Anyone can read it from the page, so it amounts to `'unsafe-inline'` presented as something stronger. It is ruled out.

Conclusion: no hash- or nonce-based storefront policy is possible while the storefront stays statically prerendered or ISR. Until that changes, `'unsafe-inline'` remains, and safety depends on output encoding at every sink.

## 3. Options

### A. Dynamic rendering plus nonce on the storefront (the real fix)

Apply the admin policy to the storefront too: `script-src 'self' 'nonce-<per request>' 'strict-dynamic'`, set on the request headers as well (proxy already does this for `/admin`). Make storefront routes dynamic with `await connection()`, or by reading `headers()` in the root layout. Pass the nonce to the two bootstrap scripts and to the GA loader.

- Third parties: with `'strict-dynamic'`, gtag.js loaded by a nonced script may load its own children, and host allowlists are ignored by CSP3 browsers (keep them for CSP2 fallback). The MSG91 widget (`src/lib/msg91-widget.ts`) injects its script from client code. That is allowed only if the injecting chunk was itself nonce- or strict-dynamic-trusted, which holds for Next chunks. hCaptcha iframes and styles fall under `frame-src` / `style-src` and are unaffected. All three need a browser check.
- Cost: every storefront page renders on every request. ISR and the static HTML at the CDN go away, so TTFB and function invocations go up. Catalogue data stays cached (`unstable_cache`, tag `catalog`, 60s), so database load does not grow per request, but render CPU does. PPR is not possible.
- Bonus: the currency could be rendered on the server from the cookie, and the pre-paint bootstrap and the `suppressHydrationWarning` on `<html>` could go. This is optional.

### B. Experimental SRI alone, keeping `'unsafe-inline'`

This adds integrity to the external chunks, which protects against tampering on a CDN or in transit. It does nothing for injected inline script, so it is not a mitigation for F01-class bugs. Low effort, low value, and the feature is experimental.

### C. Hybrid: nonce only on routes that render catalogue text

Routes affected: `/`, `/activities`, `/activities/[slug]`, `/categories/[slug]`, `/attractions/[slug]`, `/combos/[slug]`, `/collections/[slug]`, the landing pages and `/search`. That is almost the whole storefront, so this is option A with more policy branches in `proxy.ts`. Only worth it if a few high-traffic static pages (legal and help) must stay static.

### D. Keep `'unsafe-inline'` and harden the sinks (current state after this change)

- Every `type="application/ld+json"` sink uses `serializeJsonLd`. Unit tests cover the serializer; a render test covers real pages.
- The GA measurement id is written as an escaped JS string literal, and `encodeURIComponent` is used in the loader URL (`src/lib/google-tag.ts`).
- Suggested guard (Lead-owned ESLint config): a `no-restricted-syntax` rule that rejects `dangerouslySetInnerHTML={{ __html: JSON.stringify(…) }}`. Any new `dangerouslySetInnerHTML` should go through review.

## 4. Recommendation

1. Now: ship D, which is this change.
2. Next: prototype A on a local production build (`next build && next start`, against a disposable DB, never a hosted environment). Measure TTFB on `/`, `/activities/[slug]` and `/categories/[slug]` against the static build. Run the acceptance tests below. Decide with that data, because the main trade-off is cost and latency, not engineering effort.
3. If A is too expensive, stay on D and add a `Content-Security-Policy-Report-Only` header carrying the nonce policy on the dynamic routes that already exist (`/search`, `/account/**`). That surfaces third-party breakage before any wider rollout.

## 5. Acceptance tests for any tightened storefront policy

- Headers: the storefront response CSP has no `'unsafe-inline'` in `script-src`, has a per-request nonce (two requests give different values), and the request-header CSP matches. Every other header in §1 is unchanged, and `/admin` is unchanged.
- Hydration: no CSP violation reports in the browser console on `/`, `/activities/<slug>`, `/categories/<slug>`, `/lp/<slug>`, `/search`, `/checkout` and `/login`. Client navigation, the cart and currency switching work.
- Every inline `<script>` in the HTML carries the nonce: the currency and GA bootstraps, the flight pushes and the `$R*` runtime.
- Injection: `src/app/__tests__/json-ld-render.test.ts` still passes. With the serializer temporarily reverted, the injected `<script>` must also be **blocked** by the browser (CSP violation logged, `document.documentElement.dataset.lunaProof` undefined). That shows the policy is a real second layer.
- Third parties, with GA, MSG91 and hCaptcha configured in log mode or with test keys: the GA consent default is queued before gtag.js, the gtag.js request is sent, the OTP widget renders and the hCaptcha challenge completes. No violations appear.
- JSON-LD: still present and parseable, with the same structured data as before. Check with Google's Rich Results test on a preview, done by a human.
- Caching: response `Cache-Control` matches the chosen rendering mode, and no HTML carrying a nonce is cached at the CDN.

# Dependency record — D01 / H13 / H14 / G14

Advisories checked on 25 October 2026 (Nova, read-only research). The upgrade was applied by the Lead in commit `4ee02d1`. **[V]** = verified against the cited source; **[I]** = inference.

## Advisories

| Advisory | Package / range | Patched | Applies here? | Source |
|---|---|---|---|---|
| GHSA-p3m5-59mp-jv5r (CVE-2026-94482), High — Server Action DoS | next `>=16.0.0 <=16.4.0` (and 13.x–15.5.27) | 16.4.1, 15.5.28 | **Yes [V]**: App Router with Server Actions (`src/app/admin/_actions/*.ts`, `src/app/account/_actions.ts`) | https://github.com/advisories/GHSA-p3m5-59mp-jv5r |
| GHSA-2464-fhr4-w9xw (CVE-2026-96889), Critical — image optimiser SVG via sharp/librsvg on glibc | next `>=16.0.0 <=16.4.0`; sharp `<0.35.5` (GHSA-wq5f-xc86-pv6w) | next 16.4.1; sharp 0.35.5 | Reachability unconfirmed [I]: `dangerouslyAllowSVG` is unset and Next sniffs and rejects SVG before sharp; Vercel uses glibc. Upgraded regardless. | https://github.com/advisories/GHSA-2464-fhr4-w9xw ; https://github.com/advisories/GHSA-wq5f-xc86-pv6w |
| GHSA-673q-mjm6-r5xr, Critical — `use cache` RCE | next `>=16.0.0 <=16.4.0` | 16.4.1 | No [V]: no `cacheComponents` / `'use cache'` | https://nextjs.org/blog/nextjs-security-update-october-14-2026 |
| September 2026 bulletin (SSRF via `remotePatterns` GHSA-cjq9-62q9-8jv4, `next/og` RCE GHSA-vcvr-r3jv-pc5j, cache issues) | next 16.3.4 | 16.3.8 / 16.4.x | SSRF prerequisite met (`remotePatterns` set); `next/og` not used | https://nextjs.org/blog/september-2026-security-release |
| React RSC GHSA-xqc2-xf4c-x3h3 / GHSA-h3gv-c5rc-p453 | react-server-dom-* only | 19.1.10 etc. | Next vendors its own RSC runtime; the fix arrives with Next 16.4.1+ [I]. App's own `react`/`react-dom` 19.1.0 are not in the affected packages [V] | https://github.com/react/react/security/advisories |
| GHSA-mrhx-c7xc-m3w5, High — zod collection validation memory exhaustion | zod `<4.6.6` | 4.6.6 | Yes [I]: request-reachable schema parsing; also bounded by the new body ceilings | https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 |
| GHSA-ggr8-5vv4-36mx — deepmerge-ts stack exhaustion | deepmerge-ts `<8.0.0` via prisma → @prisma/config | Prisma 7 (major) | Not request-reachable [I]: CLI config loader only. **Accepted, documented, not changed.** | npm audit |
| GHSA-68fv-2mgg-jv7q — source-map-js | `<1.2.2` | 1.2.2 | Build-time CSS tooling only | npm audit |
| vite / vitest advisories | vite 8.3.0, vitest `<5.0.3` | vite 8.3.5, vitest 5.0.5 | Dev only | npm audit |

16.3.x received no backport for the October advisories ([V]: 16.3.8 was published 2026-09-30; the October bulletin names 16.4 Active LTS and 15.5 Maintenance LTS). No Next.js advisory was published after 14 October 2026 as of 25 October ([V] advisories page; 16.4.2/16.4.3 are bug-fix releases).

## Versions (lockfile)

| Package | Before | After | Scope |
|---|---|---|---|
| next, @next/env, @next/swc-* | 16.3.4 | **16.4.3** | prod |
| sharp (optional dep of next) | 0.35.4 | **0.35.5** (libvips 1.3.4) | prod |
| zod | 4.6.5 | **4.6.7** | prod |
| eslint-config-next / @next/eslint-plugin-next | 16.3.5 | 16.4.3 | dev |
| vitest / vite | 5.0.0 / 8.3.0 | 5.0.5 / 8.3.5 | dev |
| source-map-js | 1.2.1 | 1.2.2 | build tooling |
| @neon/config, @neon/env | 1.4.2, 1.3.2 (dependencies) | unchanged versions, moved to **devDependencies** | only `neon.ts` (root Neon branch config) imports them; not runtime |
| react, react-dom | 19.1.0 | unchanged | Next 16.4.3 peer `^19.0.0` satisfied |

`npm ls next sharp react react-dom zod --all`: one `next@16.4.3` (`@vercel/analytics` dedupes onto it), one `sharp@0.35.5`, one `zod@4.6.7`, no peer errors.

`npm audit` after the upgrade: 3 entries, all one chain — `prisma` → `@prisma/config` → `deepmerge-ts` (high, build/CLI time).

Install scripts (npm 11 `allowScripts`, advisory mode): no new install scripts were added by the upgrade. `unrs-resolver@1.12.2` (dev, ESLint resolver) remains unreviewed, as before.

## Compatibility and build evidence

- `npm run typecheck`: clean. `npm run lint`: 0 errors, 34 warnings (same as baseline).
- Full vitest suite: see [test-record.md](test-record.md).
- `npm run build`: success; the banner reads `▲ Next.js 16.4.3 (Turbopack)`.
- `next start` locally: security headers unchanged (CSP, HSTS, X-Frame-Options DENY, nosniff, COOP, Referrer-Policy, Permissions-Policy). Storefront pages render and hydrate with no console errors.
- Server Actions: Next's built-in Origin/Host check is unchanged. No `serverActions.allowedOrigins` is needed (each page posts to its own host).

## Not verified

- The exact trigger of GHSA-2464 (not published); whether Vercel's hosted image pipeline uses librsvg for this project.
- The React version vendored inside 16.4.3 (lookup timed out); the fix is taken from Next's statement that 16.4.1 is patched.
- Production deployment provenance: confirm after deploy that the build log shows Next.js 16.4.3.

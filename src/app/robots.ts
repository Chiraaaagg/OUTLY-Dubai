import type { MetadataRoute } from "next";

/**
 * robots.txt
 *
 * Faceted search is disallowed rather than noindexed so it never consumes
 * crawl budget (PRD §7: index high-value facet combinations, block the long
 * tail). Personal surfaces — cart, checkout, account, vouchers, booking
 * lookups — are blocked outright; those also carry page-level noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/search",
          "/compare",
          "/cart",
          "/checkout",
          "/booking/",
          "/voucher/",
          "/account",
          "/account/",
          "/manage-booking",
          "/reviews/",
          "/login",
          "/signup",
          "/maintenance",
          "/design-system",
          "/*?mock=",
        ],
      },
    ],
    sitemap: "https://outly.in/sitemap.xml",
    host: "https://outly.in",
  };
}

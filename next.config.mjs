/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not emit AGENTS.md / CLAUDE.md into the repo on dev start.
  agentRules: false,
  // No framework fingerprint in responses (§13.8).
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      // PRD short taxonomy (§4.1) kept alive as canonical-preserving redirects.
      { source: "/d/:slug", destination: "/activities/:slug", permanent: true },
      { source: "/c/:slug", destination: "/categories/:slug", permanent: true },
      { source: "/account/trips", destination: "/account/bookings", permanent: true },
      { source: "/account/wishlist", destination: "/account/saved", permanent: true },
      { source: "/packages/:slug", destination: "/combos/:slug", permanent: true },
      { source: "/experiences/:slug", destination: "/collections/:slug", permanent: true },
    ];
  },
};
export default nextConfig;

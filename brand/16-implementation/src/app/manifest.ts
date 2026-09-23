import type { MetadataRoute } from "next";

/**
 * Web app manifest — served at /manifest.webmanifest by Next's file convention.
 * Icons live in /public (copy from brand/04-app-icons/). Colours match
 * `viewport.themeColor` in app/layout.tsx (#FFF8F0, Sand).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OUTLYY — Dubai experiences",
    short_name: "OUTLYY",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF8F0",
    theme_color: "#FFF8F0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

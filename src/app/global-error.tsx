"use client";

import { emergencyDisplay, emergencyHref, siteConfig, whatsappDisplay } from "@/lib/site-config";

/**
 * Root error boundary. Replaces the entire document when the layout itself
 * fails, so it deliberately carries no imports from the design system — if the
 * failure is in a shared component, importing it here would fail too. Inline
 * styles only. The one import is `site-config`, which is a dependency-free
 * module of environment reads, so the emergency number on the page is the
 * real one (audit X03) — and the line is dropped entirely when none is set.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const wa = whatsappDisplay();
  const phone = emergencyDisplay();
  const phoneHref = emergencyHref();

  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFF8F0",
          color: "#14101f",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#e85403",
              margin: 0,
            }}
          >
            OUTLYY
          </p>
          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.2, margin: "12px 0" }}>
            The site has fallen over
          </h1>
          <p style={{ lineHeight: 1.65, color: "#574a71", margin: "0 0 20px" }}>
            Nothing has been charged and no booking has been changed. Your vouchers are already in
            WhatsApp and your email, and they work without this site.
          </p>
          <button
            onClick={reset}
            style={{
              minHeight: "48px",
              padding: "0 24px",
              borderRadius: "12px",
              border: "none",
              background: "#ff6a13",
              color: "#fff",
              fontWeight: 700,
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Reload the page
          </button>
          {(wa || phone) && (
            <p style={{ marginTop: "24px", fontSize: "0.875rem", color: "#574a71" }}>
              Need help now?
              {wa && (
                <>
                  {" "}
                  WhatsApp{" "}
                  <a
                    href={`https://wa.me/${siteConfig.whatsappNumber}`}
                    style={{ color: "#bd4102", fontWeight: 700 }}
                  >
                    {wa}
                  </a>
                </>
              )}
              {wa && phone && " ·"}
              {phone && phoneHref && (
                <>
                  {" "}
                  In Dubai:{" "}
                  <a href={phoneHref} style={{ color: "#bd4102", fontWeight: 700 }}>
                    {phone}
                  </a>
                </>
              )}
            </p>
          )}
          {error.digest && (
            <p style={{ marginTop: "16px", fontSize: "0.75rem", color: "#a79eb8" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

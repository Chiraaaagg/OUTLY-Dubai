import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AppProvider } from "@/components/providers/app-provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { CookieBanner } from "@/components/layout/cookie-banner";
import { StorefrontOnly } from "@/components/layout/storefront-only";
import { CURRENCY_BOOTSTRAP_SCRIPT } from "@/lib/currency";

/**
 * Type pairing:
 *  Bricolage Grotesque — display. Slightly quirky, high-contrast, modern. It
 *    carries the "playful but not childish" half of the brief.
 *  Plus Jakarta Sans — body. Warm, wide apertures, excellent at 14–16px on
 *    mid-range Android, which is the device this product is designed for.
 * Both are variable fonts loaded with `display: swap`, subset to latin.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["600", "700", "800"],
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://outlyy.com"),
  title: {
    default: "OUTLYY — Dubai Experiences, One All-In Price",
    template: "%s | OUTLYY",
  },
  description:
    "Book Dubai activities at one all-in price in your own currency, with pure-veg and Jain food options, hotel pickup and WhatsApp support in about 30 minutes. No fees added at checkout.",
  openGraph: {
    type: "website",
    siteName: "OUTLYY",
    locale: "en_IN",
  },
  alternates: {
    canonical: "/",
    languages: { "en-IN": "/", "en-AE": "/?currency=AED" },
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#FFF8F0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable}`}>
      <head>
        {/*
          Sets data-ccy from the currency cookie before the first paint, so a
          statically prerendered page shows the visitor's currency with no
          flash and no layout shift. It only writes an attribute, so React's
          hydration never sees a mismatch. See src/lib/currency.ts.
        */}
        <script dangerouslySetInnerHTML={{ __html: CURRENCY_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <AppProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer />
          <CookieBanner />
          {/* Storefront only: staff screens carry customer PII and are never measured. */}
          <StorefrontOnly>
            <GoogleAnalytics />
          </StorefrontOnly>
          <Toaster />
        </AppProvider>
      </body>
    </html>
  );
}

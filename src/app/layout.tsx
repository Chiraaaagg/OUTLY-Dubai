import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AppProvider } from "@/components/providers/app-provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

/**
 * Type pairing:
 *  Bricolage Grotesque — display. Slightly quirky, high-contrast, modern. It
 *    carries the "playful but not childish" half of the brief.
 *  Plus Jakarta Sans — body. Warm, wide apertures, excellent at 14–16px on
 *    mid-range Android, which is the device this product is designed for.
 * Both are variable fonts loaded with `display: swap`, subset to latin.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["600", "700", "800"],
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://outly.in"),
  title: {
    default: "OUTLY — Dubai Experiences for Indian Travellers, Priced in Rupees",
    template: "%s | OUTLY",
  },
  description:
    "Book Dubai activities in all-in rupee pricing with UPI, pure-veg and Jain food options, hotel pickup and WhatsApp support in about 8 minutes. No fees added at checkout.",
  openGraph: {
    type: "website",
    siteName: "OUTLY",
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
      <body>
        <AppProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer />
          <Toaster />
        </AppProvider>
      </body>
    </html>
  );
}

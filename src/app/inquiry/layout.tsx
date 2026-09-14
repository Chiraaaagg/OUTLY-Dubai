import type { Metadata } from "next";

/** Client-rendered route — metadata lives in this layout instead of the page. */
export const metadata: Metadata = {
  title: { default: "Check availability & price", template: "%s | OUTLY" },
  description:
    "Two fields, thirty seconds. A named person confirms with the operator and replies on WhatsApp in about 30 minutes with the exact all-in price. Nothing is charged until you say yes.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

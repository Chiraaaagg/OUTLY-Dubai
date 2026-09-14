import type { Metadata } from "next";

/** Client-rendered route — metadata lives in this layout instead of the page. */
export const metadata: Metadata = {
  title: "Contact OUTLY",
  description: "Reach a real person on WhatsApp in about eight minutes, or send us a message about an invoice, a group booking or a supplier enquiry.",
  robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

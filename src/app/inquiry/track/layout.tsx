import type { Metadata } from "next";

/** Client-rendered route — metadata lives in this layout instead of the page. */
export const metadata: Metadata = {
  title: "Track your inquiry",
  description:
    "Check the status of any OUTLYY inquiry with your reference and the WhatsApp number you used. No sign-in needed.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

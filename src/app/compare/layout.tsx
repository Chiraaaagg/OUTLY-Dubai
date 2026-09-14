import type { Metadata } from "next";

/** Client-rendered route — metadata lives in this layout instead of the page. */
export const metadata: Metadata = {
  title: "Compare Dubai experiences",
  description: "Compare up to three Dubai experiences side by side on price, pickup, confirmation, cancellation and food.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

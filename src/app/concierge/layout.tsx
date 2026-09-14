import type { Metadata } from "next";

/** Client-rendered route — metadata lives in this layout instead of the page. */
export const metadata: Metadata = {
  title: "Concierge & private itineraries",
  description: "Private yacht charters, helicopter flights and bespoke Dubai itineraries, arranged by a named coordinator with a quote in two hours.",
  robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

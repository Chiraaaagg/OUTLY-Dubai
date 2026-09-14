import type { Metadata } from "next";

/** Client-rendered route — metadata lives in this layout instead of the page. */
export const metadata: Metadata = {
  title: "Write a review",
  description: "Tell other travellers how your Dubai experience actually went.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

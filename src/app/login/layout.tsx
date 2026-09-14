import type { Metadata } from "next";

/** Client-rendered route — metadata lives in this layout instead of the page. */
export const metadata: Metadata = {
  title: "Log in",
  description: "Log in with a one-time code sent to your phone.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

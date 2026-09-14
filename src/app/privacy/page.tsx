import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPageView } from "@/components/pages/legal-page";
import { legalPages } from "@/lib/data/legal";

const SLUG = "privacy";

export function generateMetadata(): Metadata {
  const page = legalPages[SLUG];
  return {
    title: page.title,
    description: page.intro.slice(0, 155),
    alternates: { canonical: `/${SLUG}` },
  };
}

export default function Page() {
  const page = legalPages[SLUG];
  if (!page) notFound();
  return <LegalPageView page={page} />;
}

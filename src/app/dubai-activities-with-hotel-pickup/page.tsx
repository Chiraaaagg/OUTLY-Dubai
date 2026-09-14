import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingPageView } from "@/components/pages/landing-page";
import { landingBySlug } from "@/lib/data/landing-pages";

const SLUG = "dubai-activities-with-hotel-pickup";

export function generateMetadata(): Metadata {
  const page = landingBySlug(SLUG)!;
  return {
    title: page.meta.title,
    description: page.meta.description,
    keywords: page.meta.keywords,
    alternates: { canonical: `/${SLUG}` },
    openGraph: { title: page.meta.title, description: page.meta.description },
  };
}

/** Top-level SEO route — highest-volume query, so it earns a short URL. */
export default function Page() {
  const page = landingBySlug(SLUG);
  if (!page) notFound();
  return <LandingPageView page={page} />;
}

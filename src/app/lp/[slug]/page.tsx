import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingPageView } from "@/components/pages/landing-page";
import { landingBySlug, templateLandingPages } from "@/lib/data/landing-pages";

export function generateStaticParams() {
  return templateLandingPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = landingBySlug(slug);
  if (!page) return { title: "Page not found" };
  return {
    title: page.meta.title,
    description: page.meta.description,
    keywords: page.meta.keywords,
    alternates: { canonical: `/lp/${page.slug}` },
    openGraph: { title: page.meta.title, description: page.meta.description },
  };
}

/**
 * High-intent SEO landing pages that don't warrant a top-level URL.
 * The six highest-volume queries get top-level routes instead — see
 * src/app/(landing)/ — but they render through the same template.
 */
export default async function TemplateLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = landingBySlug(slug);
  if (!page || page.topLevel) notFound();
  return <LandingPageView page={page} />;
}

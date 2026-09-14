import Link from "next/link";
import { PageView } from "@/components/analytics/page-view";
import { WhatsAppCard } from "@/components/commerce/whatsapp";
import { Breadcrumbs, Prose } from "@/components/ui/primitives";
import type { LegalPage } from "@/lib/data/legal";

/**
 * Shared trust & legal layout.
 *
 * Deliberately plain: a table of contents, generous line height, and no
 * merchandising above the content. The one CTA at the bottom is WhatsApp,
 * because someone reading the cancellation policy usually has a live problem.
 */
export function LegalPageView({ page }: { page: LegalPage }) {
  return (
    <div className="container-page py-6 pb-20">
      <div className="mx-auto max-w-3xl">
        <PageView pageType="legal" props={{ landing_page: page.slug }} />
        <Breadcrumbs
          items={[{ label: "Dubai", href: "/" }, { label: page.title }]}
          className="mb-3"
        />
        <h1 className="text-[1.75rem] sm:text-4xl">{page.title}</h1>
        <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-600">{page.intro}</p>
        <p className="mt-2 text-xs text-ink-500">Last updated {page.updated}</p>

        <nav aria-label="On this page" className="mt-6 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4">
          <p className="mb-2 text-2xs font-extrabold uppercase tracking-[0.12em] text-ink-400">
            On this page
          </p>
          <ul className="space-y-1.5">
            {page.sections.map((s, i) => (
              <li key={s.heading}>
                <a
                  href={`#s-${i}`}
                  className="text-sm font-semibold text-sun-700 underline underline-offset-2"
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {page.sections.map((s, i) => (
          <section key={s.heading} id={`s-${i}`} className="mt-8 scroll-mt-32">
            <h2 className="text-xl sm:text-2xl">{s.heading}</h2>
            <Prose className="mt-3">
              {s.paragraphs.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {s.bullets && (
                <ul className="list-disc space-y-1.5 pl-5">
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </Prose>
          </section>
        ))}

        <WhatsAppCard
          className="mt-10"
          context={{ intent: "general", placement: `legal_${page.slug}` }}
          title="Rather just ask?"
          body="Policies are policies. If you have a specific situation, message us and we'll tell you exactly where you stand — usually within about eight minutes."
        />

        <p className="mt-8 text-sm text-ink-600">
          See also:{" "}
          <Link href="/cancellation-policy" className="font-bold text-sun-700 underline underline-offset-2">
            Cancellation policy
          </Link>
          {" · "}
          <Link href="/price-guarantee" className="font-bold text-sun-700 underline underline-offset-2">
            Price promise
          </Link>
          {" · "}
          <Link href="/faq" className="font-bold text-sun-700 underline underline-offset-2">
            FAQ
          </Link>
        </p>
      </div>
    </div>
  );
}

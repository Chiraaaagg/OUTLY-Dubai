import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Logo } from "./logo";
import { StorefrontOnly } from "./storefront-only";
import { getCategories } from "@/lib/catalog/server";
import type { Category } from "@/lib/types";
import { CookieSettingsLink } from "./cookie-settings-link";
import {
  emergencyDisplay,
  emergencyHref,
  entityLine,
  legalLine,
  siteConfig,
  whatsappDisplay,
} from "@/lib/site-config";

/**
 * Site footer (audit S01).
 *
 * Three bands on the dark ink ground, reimplemented from the layout of
 * 21st.dev `@shadcnspace/footer-01` (brand summary · sitemap · legal · contact)
 * on OUTLYY tokens:
 *
 *   A. Brand — wordmark, one-line promise, the contact channels that are
 *      actually configured, and a single-line trust summary.
 *   B. Sitemap — three link columns plus the category row (internal links the
 *      category pages rely on, AC-CAT-01).
 *   C. Legal — `legalLine()` from site-config and the policy links.
 *
 * Every phone, email and legal identifier comes from `siteConfig`; an unset
 * value renders nothing (audit X03). The old PCI box and "We accept" badge row
 * are gone — payment-method chips live on the ADP "When you pay" block, and the
 * footer says the one honest thing about payment instead.
 */

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Popular searches",
    links: [
      { label: "Burj Khalifa tickets", href: "/lp/burj-khalifa-tickets" },
      { label: "Desert safari Dubai", href: "/lp/desert-safari-dubai" },
      { label: "Dubai Frame tickets", href: "/lp/dubai-frame-tickets" },
      { label: "Atlantis Aquaventure", href: "/lp/atlantis-aquaventure-tickets" },
      { label: "Marina cruise", href: "/lp/marina-cruise-dubai" },
      { label: "Abu Dhabi day tours", href: "/abu-dhabi-day-tours-from-dubai" },
    ],
  },
  {
    title: "For Indian travellers",
    links: [
      { label: "Dubai activities for Indians", href: "/dubai-activities-for-indians" },
      { label: "Pay with UPI", href: "/dubai-activities-with-upi" },
      { label: "Jain & pure veg friendly", href: "/collections/jain-veg-friendly" },
      { label: "Travelling with parents", href: "/collections/senior-friendly" },
      { label: "With hotel pickup", href: "/dubai-activities-with-hotel-pickup" },
      { label: "Last-minute activities", href: "/last-minute-dubai-activities" },
    ],
  },
  {
    title: "Your inquiries",
    links: [
      { label: "Track an inquiry", href: "/inquiry/track" },
      { label: "My inquiries", href: "/account/inquiries" },
      { label: "Find my booking", href: "/manage-booking" },
      { label: "My trips", href: "/account/bookings" },
      { label: "Saved activities", href: "/account/saved" },
      { label: "Help centre", href: "/support" },
      { label: "FAQ", href: "/faq" },
      { label: "Contact us", href: "/contact" },
    ],
  },
];

const LEGAL_LINKS = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
  { label: "Your data rights", href: "/data-rights" },
  { label: "Cancellation policy", href: "/cancellation-policy" },
  { label: "How prices work", href: "/price-guarantee" },
  { label: "Disclaimer", href: "/disclaimer" },
];

/** Hidden under /admin — the console has its own shell. Stays a Server Component; only the gate is client-side. */
export async function Footer() {
  const categories = await getCategories();
  return (
    <StorefrontOnly>
      <FooterInner categories={categories} />
    </StorefrontOnly>
  );
}

function FooterInner({ categories }: { categories: Category[] }) {
  const entity = entityLine();
  const wa = whatsappDisplay();
  const emergency = emergencyDisplay();
  const emergencyTel = emergencyHref();
  const email = siteConfig.supportEmail;
  const hasContact = Boolean(wa || (emergency && emergencyTel) || email);

  // Claims we can stand behind on day one. The review and supplier counts
  // that used to sit here described a track record OUTLYY does not have.
  const trustLine = ["30-minute reply promise", "One all-in price", "Nothing charged before the operator confirms"];

  return (
    <footer className="mt-16 border-t border-ink-200 bg-ink-900 text-white">
      <div className="container-page">
        {/* Band A — brand, promise, contact, trust */}
        <div className="grid grid-safe gap-8 py-12 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
          <div>
            <Logo tone="white" />
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
              The most trusted way for Indians to book Dubai — where the price you see is the price
              you pay, in your own currency, and a human confirms it before you pay anything.
            </p>
            <p className="mt-4 max-w-md text-xs leading-relaxed text-white/55">
              You pay only after a real person confirms availability — by UPI, card or EMI through a
              secure Razorpay link.
            </p>
          </div>

          <div className="lg:justify-self-end">
            {hasContact && (
              <address className="space-y-2.5 text-sm not-italic">
                {wa && (
                  <a
                    href={`https://wa.me/${siteConfig.whatsappNumber}`}
                    className="flex items-center gap-2.5 font-semibold text-white hover:underline"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0 text-whatsapp" aria-hidden="true" />
                    WhatsApp: {wa}
                  </a>
                )}
                {emergency && emergencyTel && (
                  <a href={emergencyTel} className="flex items-center gap-2.5 text-white/75 hover:underline">
                    <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    24/7 in-destination: {emergency}
                  </a>
                )}
                {email && (
                  <a href={`mailto:${email}`} className="flex items-center gap-2.5 text-white/75 hover:underline">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {email}
                  </a>
                )}
                <p className="text-xs text-white/50">{siteConfig.supportHours}</p>
              </address>
            )}

            <p
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60 ${hasContact ? "mt-5" : ""}`}
            >
              {trustLine.map((t, i) => (
                <span key={t} className="flex items-center gap-x-2">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-white/30">
                      ·
                    </span>
                  )}
                  <span className="tnum">{t}</span>
                </span>
              ))}
            </p>
          </div>
        </div>

        {/* Band B — sitemap */}
        <div className="border-t border-white/10 py-10">
          <div className="grid gap-8 sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="mb-3 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-white/50">
                  {col.title}
                </h2>
                <ul className="space-y-2 text-sm">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-white/75 hover:text-white hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <nav aria-label="All categories" className="mt-8">
            <h2 className="mb-3 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-white/50">
              Browse by category
            </h2>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/categories/${c.slug}`} className="text-white/75 hover:text-white hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Band C — legal */}
        <div className="flex flex-col gap-4 border-t border-white/10 py-6 text-xs text-white/55 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p>{legalLine()}</p>
            {entity && <p className="text-white/45">{entity}</p>}
            {siteConfig.registeredAddress && <p className="text-white/45">{siteConfig.registeredAddress}</p>}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <CookieSettingsLink className="hover:text-white hover:underline" />
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

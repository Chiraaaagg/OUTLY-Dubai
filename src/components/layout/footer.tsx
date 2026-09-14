import Link from "next/link";
import { Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { Logo } from "./logo";
import { categories } from "@/lib/data/categories";
import { platformStats } from "@/lib/data/reviews";

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
    title: "Your booking",
    links: [
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

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-200 bg-ink-900 text-white">
      <div className="container-page py-12">
        {/* Trust strip */}
        <div className="mb-10 grid gap-6 rounded-[var(--radius-tile)] border border-white/10 bg-white/5 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <FooterStat
            value={platformStats.travellersServed.toLocaleString("en-IN")}
            label="Indian travellers booked"
          />
          <FooterStat value={`${platformStats.averageRating} / 5`} label={`From ${platformStats.reviewCount.toLocaleString("en-IN")} verified reviews`} />
          <FooterStat value="30 min" label="Reply promise on every inquiry, 9am–11pm IST" />
          <FooterStat value={`${platformStats.suppliersVerified}`} label="Verified suppliers, scored monthly" />
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.3fr_2.4fr]">
          <div>
            <Logo tone="white" />
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
              The most trusted way for Indians to book Dubai — where the price you see is the price
              you pay, in rupees, and a human confirms it before you pay a rupee.
            </p>

            <div className="mt-5 space-y-2.5 text-sm">
              <a
                href="https://wa.me/919000000000"
                className="flex items-center gap-2.5 font-semibold text-white hover:underline"
              >
                <MessageCircle className="h-4 w-4 text-whatsapp" />
                WhatsApp: +91 90000 00000
              </a>
              <a href="tel:+97140000000" className="flex items-center gap-2.5 text-white/75 hover:underline">
                <Phone className="h-4 w-4" />
                24/7 in-destination: +971 4 000 0000
              </a>
              <a href="mailto:help@outly.in" className="flex items-center gap-2.5 text-white/75 hover:underline">
                <Mail className="h-4 w-4" />
                help@outly.in
              </a>
            </div>

            <p className="mt-5 flex items-start gap-2 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/70">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lagoon-300" />
              Payments are handled by a PCI-DSS compliant gateway. Card details never reach our
              servers.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white/50">
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
        </div>

        <nav aria-label="All categories" className="mt-10 border-t border-white/10 pt-6">
          <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white/50">
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

        <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} OUTLY Travel Technologies Pvt. Ltd. · GSTIN 07AABCO1234A1Z5
            · Dubai DED licence 000000
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {[
              { label: "Terms", href: "/terms" },
              { label: "Privacy", href: "/privacy" },
              { label: "Cancellation policy", href: "/cancellation-policy" },
              { label: "Price guarantee", href: "/price-guarantee" },
              { label: "Design system", href: "/design-system" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 flex flex-wrap items-center gap-2 text-2xs text-white/45">
          <span className="font-semibold text-white/70">We accept:</span>
          {["UPI", "GPay", "PhonePe", "Paytm", "Visa", "Mastercard", "RuPay", "Netbanking", "EMI", "AED cards"].map(
            (m) => (
              <span key={m} className="rounded border border-white/15 px-2 py-1">
                {m}
              </span>
            ),
          )}
        </p>
      </div>
    </footer>
  );
}

function FooterStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold tnum">{value}</p>
      <p className="mt-0.5 text-xs leading-snug text-white/60">{label}</p>
    </div>
  );
}

import type { Metadata } from "next";
import { Clock, MessageCircle, Phone, Ticket } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";

export const metadata: Metadata = {
  title: "We'll be back shortly",
  robots: { index: false, follow: false },
};

/**
 * MAINTENANCE
 *
 * The one page that must stay useful while everything else is down. Three
 * things a customer might need mid-outage are all reachable without the app:
 * their voucher (already delivered to WhatsApp and email), a human on WhatsApp,
 * and the 24/7 emergency number for anyone standing at a meeting point right
 * now. Booking is unavailable; support never is.
 */
export default function MaintenancePage() {
  return (
    <div className="sun-wash min-h-[70vh]">
      <div className="container-page flex flex-col items-center justify-center py-16 text-center">
        <Logo href={null} className="mb-6" />

        <div className="mb-6 h-40 w-full max-w-sm overflow-hidden rounded-[var(--radius-tile)]">
          <Scene src="dune-sunset" alt="" />
        </div>

        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-sun-600">
          Scheduled maintenance
        </p>
        <h1 className="mt-2 max-w-2xl text-[2rem] leading-tight sm:text-4xl">
          We&apos;re making a few things faster. Back within the hour.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink-700">
          New bookings are paused for a short while. Every existing booking is unaffected — your
          voucher already lives in WhatsApp and your email, and it works offline.
        </p>

        <div className="mt-8 grid w-full max-w-3xl gap-4 text-left sm:grid-cols-3">
          <Card className="p-5">
            <Ticket className="mb-2 h-5 w-5 text-sun-500" aria-hidden="true" />
            <h2 className="text-[1.02rem]">Need your voucher?</h2>
            <p className="mt-1 text-sm text-ink-600">
              Check your WhatsApp — it was delivered when you booked and doesn&apos;t need this site.
            </p>
          </Card>
          <Card className="p-5">
            <MessageCircle className="mb-2 h-5 w-5 text-whatsapp" aria-hidden="true" />
            <h2 className="text-[1.02rem]">Want to book?</h2>
            <p className="mt-1 text-sm text-ink-600">
              Message us and an agent will book it manually — same price, same voucher.
            </p>
            <a
              href="https://wa.me/919000000000"
              className="mt-2 inline-block text-sm font-bold text-sun-700 underline underline-offset-2"
            >
              +91 90000 00000
            </a>
          </Card>
          <Card className="border-[color-mix(in_oklab,var(--color-danger)_25%,white)] p-5">
            <Phone className="mb-2 h-5 w-5 text-[var(--color-danger)]" aria-hidden="true" />
            <h2 className="text-[1.02rem]">In Dubai right now?</h2>
            <p className="mt-1 text-sm text-ink-600">
              The 24/7 emergency line is unaffected and answered by a person.
            </p>
            <a
              href="tel:+97140000000"
              className="mt-2 inline-block text-sm font-bold text-sun-700 underline underline-offset-2"
            >
              +971 4 000 0000
            </a>
          </Card>
        </div>

        <p className="mt-8 flex items-center gap-2 text-sm text-ink-600">
          <Clock className="h-4 w-4" aria-hidden="true" />
          Started 02:00 IST · expected back by 03:00 IST
        </p>

        <ButtonLink href="/" className="mt-6" variant="outline">
          Try the site again
        </ButtonLink>
      </div>
    </div>
  );
}

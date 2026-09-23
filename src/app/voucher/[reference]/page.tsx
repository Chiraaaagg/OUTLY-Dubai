import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Phone, ShieldAlert, Utensils } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { VoucherActions, VoucherCode } from "@/components/commerce/voucher";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { Logo } from "@/components/layout/logo";
import { Alert, Breadcrumbs, Card } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { bookings, bookingByReference } from "@/lib/data/bookings";
import { getActivities } from "@/lib/catalog/server";
import { emergencyDisplay, emergencyHref, whatsappDisplay } from "@/lib/site-config";
import { formatDateLong, paxLabel } from "@/lib/utils";

export function generateStaticParams() {
  return bookings.map((b) => ({ reference: b.reference }));
}

export const metadata: Metadata = {
  title: "Your voucher",
  robots: { index: false, follow: false },
};

/**
 * VOUCHER PAGE
 *
 * PRD §5.7 requires: booking ref, QR, activity, date, time, pax, supplier name
 * and contact, pickup details, inclusions, emergency support number and
 * cancellation terms — on the voucher itself, because the customer will open
 * this at a camp gate with no signal and no patience.
 *
 * Print styles are real, not decorative: this has to come out correctly on A4
 * (AC-VOU-04), which is what a lot of Indian travellers will actually do.
 */
export default async function VoucherPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const booking = bookingByReference(reference);
  const catalogue = await getActivities();
  const emergency = emergencyDisplay();
  const emergencyTel = emergencyHref();
  const wa = whatsappDisplay();

  if (!booking) {
    return (
      <div className="container-page py-10 pb-20">
        <div className="mx-auto max-w-2xl">
          <Alert tone="info" title="This voucher isn't ready yet" icon={<Clock className="h-4.5 w-4.5" />}>
            <p>
              Booking <strong className="font-bold">{reference}</strong> is still being confirmed
              with the operator, or the reference doesn&apos;t match one of ours. Vouchers for
              instant-confirmation bookings arrive within about a minute; ones the operator has to
              confirm take up to two hours.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href="/manage-booking" size="sm">
                Find my booking
              </ButtonLink>
              <WhatsAppButton
                size="sm"
                context={{ intent: "voucher", bookingReference: reference, placement: "voucher_missing" }}
              />
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  const pending = booking.status === "supplier_pending";

  return (
    <div className="container-page py-6 pb-20">
      <PageView pageType="voucher" props={{ booking_reference: booking.reference }} />

      <div className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={[
            { label: "Dubai", href: "/" },
            { label: "My trips", href: "/account/bookings" },
            { label: booking.reference },
          ]}
          className="mb-4 print:hidden"
        />

        {/* Brand lockup. Printed too — the print sheet keeps the voucher's own
            header, so the black version carries it on a monochrome printer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/outlyy-voucher-lockup.svg"
          alt="OUTLYY"
          width={300}
          height={64}
          className="mb-4 h-12 w-auto print:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/outlyy-voucher-lockup-print-black.svg"
          alt="OUTLYY"
          width={300}
          height={64}
          className="mb-4 hidden h-12 w-auto print:block"
        />

        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-[1.75rem] sm:text-3xl">Your voucher</h1>
            <p className="mt-1 text-sm text-ink-600">
              Show this at the venue or to your driver. It works offline once you&apos;ve opened it.
            </p>
          </div>
        </div>

        <div className="mb-5 print:hidden">
          <VoucherActions reference={booking.reference} />
        </div>

        {pending && (
          <Alert tone="warning" className="mb-5" title="Awaiting operator confirmation">
            This voucher becomes valid once the operator confirms — within two hours of booking.
            You&apos;ll get a WhatsApp message either way. Don&apos;t travel to the meeting point
            until it says confirmed.
          </Alert>
        )}

        {/* The voucher itself */}
        <article className="overflow-hidden rounded-[var(--radius-tile)] border-2 border-ink-900 bg-paper print:border">
          <header className="flex items-center justify-between gap-4 border-b-2 border-dashed border-ink-300 bg-shell p-5">
            <Logo href={null} />
            <div className="text-right">
              <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                Booking reference
              </p>
              <p className="font-display text-xl font-bold tnum text-ink-900">
                {booking.reference}
              </p>
            </div>
          </header>

          {booking.items.map((item) => {
            const activity = catalogue.find((a) => a.slug === item.slug);
            return (
              <section key={item.id} className="border-b border-dashed border-ink-300 p-5 last:border-0">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-extrabold uppercase tracking-[0.12em] text-sun-600">
                      {item.confirmation === "instant" ? "Confirmed" : pending ? "Pending confirmation" : "Confirmed"}
                    </p>
                    <h2 className="mt-0.5 text-xl leading-tight">{item.title}</h2>
                    {item.variantName && (
                      <p className="text-sm text-ink-600">{item.variantName}</p>
                    )}

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                          Date
                        </dt>
                        <dd className="font-semibold text-ink-900">{formatDateLong(item.date)}</dd>
                      </div>
                      <div>
                        <dt className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                          Time
                        </dt>
                        <dd className="font-semibold text-ink-900">{item.time}</dd>
                      </div>
                      <div>
                        <dt className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                          Guests
                        </dt>
                        <dd className="font-semibold text-ink-900">{paxLabel(item.pax)}</dd>
                      </div>
                      <div>
                        <dt className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                          Lead traveller
                        </dt>
                        <dd className="font-semibold text-ink-900">{booking.traveller.fullName}</dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex items-start gap-2 text-sm">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
                      <span>
                        <strong className="font-bold">Meeting point:</strong>{" "}
                        {activity?.meetingPoint ?? booking.traveller.hotel ?? "See booking details"}
                      </span>
                    </div>

                    {booking.driver && (
                      <div className="mt-3 rounded-[var(--radius-control)] bg-lagoon-50 p-3 text-sm">
                        <p className="font-bold text-lagoon-700">Your driver</p>
                        <p className="text-lagoon-700/90">
                          {booking.driver.name} · {booking.driver.phone}
                          <br />
                          {booking.driver.vehicle} · pickup {booking.driver.window}
                        </p>
                      </div>
                    )}

                    {booking.traveller.dietary && (
                      <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-success-bg)] p-3 text-sm font-semibold text-[var(--color-success)]">
                        <Utensils className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        Dietary requirement confirmed with the operator:{" "}
                        {booking.traveller.dietary === "jain"
                          ? "Jain — no onion, no garlic"
                          : booking.traveller.dietary}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-center">
                    <VoucherCode reference={`${booking.reference}-${item.id}`} />
                    <p className="mt-1.5 text-2xs text-ink-500">Scan at entry</p>
                  </div>
                </div>

                {activity && activity.inclusions.length > 0 && (
                  <div className="mt-4 border-t border-ink-200 pt-3">
                    <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                      Included
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">
                      {activity.inclusions.join(" · ")}
                    </p>
                  </div>
                )}
              </section>
            );
          })}

          <footer className="space-y-3 bg-ink-900 p-5 text-white">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              {emergency && emergencyTel && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wide text-white/50">
                    Emergency support · 24/7
                  </p>
                  <a href={emergencyTel} className="flex items-center gap-1.5 font-bold">
                    <Phone className="h-4 w-4" />
                    {emergency}
                  </a>
                </div>
              )}
              {booking.supplierContact && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wide text-white/50">
                    Operator
                  </p>
                  <p className="font-semibold">
                    {booking.supplierContact.name} · {booking.supplierContact.phone}
                  </p>
                </div>
              )}
              {wa && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wide text-white/50">WhatsApp</p>
                  <p className="font-semibold">{wa}</p>
                </div>
              )}
            </div>
            <p className="flex items-start gap-2 border-t border-white/15 pt-3 text-xs leading-relaxed text-white/70">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {booking.items[0]?.freeCancellationHours
                ? `Free cancellation up to ${booking.items[0].freeCancellationHours} hours before your start time. After that, no refund. Cancel from Manage booking — the exact refund amount is shown before you confirm.`
                : `This booking is non-refundable. If something goes wrong on the day, ${emergency ? "call the emergency number above" : "message us on WhatsApp"} before leaving the venue.`}
            </p>
          </footer>
        </article>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 print:hidden">
          <Card className="p-5">
            <h2 className="text-lg">Need to change something?</h2>
            <p className="mt-1.5 text-sm text-ink-600">
              Date changes and cancellations can be done yourself where the operator&apos;s terms
              allow, with the fee or refund shown before you confirm.
            </p>
            <ButtonLink href={`/booking/${booking.reference}`} variant="outline" size="sm" className="mt-3">
              Manage this booking
            </ButtonLink>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg">Something wrong on the day?</h2>
            <p className="mt-1.5 text-sm text-ink-600">
              Message us before you leave the venue. We can call the operator, reissue a ticket, or
              arrange another vehicle.
            </p>
            <div className="mt-3">
              <WhatsAppButton
                size="sm"
                context={{
                  intent: "booking_support",
                  bookingReference: booking.reference,
                  placement: "voucher",
                }}
              />
            </div>
          </Card>
        </div>

        <p className="mt-6 text-center text-sm text-ink-500 print:hidden">
          <Link href="/account/bookings" className="font-bold text-sun-700 underline underline-offset-2">
            See all my bookings
          </Link>
        </p>
      </div>
    </div>
  );
}

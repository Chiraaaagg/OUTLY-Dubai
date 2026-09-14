"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Camera, Star } from "lucide-react";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { submitReview } from "@/lib/api";
import { track } from "@/lib/analytics";
import { bookingByReference } from "@/lib/data/bookings";
import { cn, formatDateLong } from "@/lib/utils";

/**
 * REVIEW SUBMISSION (PRD §5.11)
 *
 * Only reachable with a completed booking reference (AC-REV-01) — the URL is
 * the proof of purchase, which is what makes every review on the site verified.
 *
 * The dietary question is deliberately its own field rather than free text: a
 * "no" is a supplier quality signal that routes to the scorecard, and burying
 * it in prose would make it unmeasurable.
 */
const SUB_RATINGS = [
  { id: "value", label: "Value for money" },
  { id: "guide", label: "Guide or driver" },
  { id: "food", label: "Food" },
  { id: "transport", label: "Transport" },
] as const;

export default function ReviewPage({ params }: { params: Promise<{ booking: string }> }) {
  const { booking: reference } = use(params);
  const booking = bookingByReference(reference);

  const [rating, setRating] = useState(0);
  const [subRatings, setSubRatings] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dietaryMet, setDietaryMet] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const item = booking?.items[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError("Pick a star rating — it's the only required field.");
      return;
    }
    setState("sending");
    setError(null);
    try {
      await submitReview({ reference, rating, body, dietaryMet: dietaryMet ?? undefined });
      track("review_submitted", {
        booking_reference: reference,
        activity_slug: item?.slug,
        value: rating,
      });
      setState("sent");
    } catch {
      setState("error");
      setError("That didn't send. Nothing you wrote is lost — try again in a moment.");
    }
  };

  if (!booking) {
    return (
      <div className="container-page py-10 pb-20">
        <div className="mx-auto max-w-2xl">
          <Alert tone="info" title="We can't find that booking">
            Reviews can only be written against a completed booking — that&apos;s what makes every
            review on OUTLY verified. Check the link in your review request message, or find your
            booking first.
            <div className="mt-3">
              <ButtonLink href="/manage-booking" size="sm">
                Find my booking
              </ButtonLink>
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6 pb-20">
      <div className="mx-auto max-w-2xl">
        <Breadcrumbs
          items={[
            { label: "Dubai", href: "/" },
            { label: "My trips", href: "/account/bookings" },
            { label: "Write a review" },
          ]}
          className="mb-3"
        />

        {state === "sent" ? (
          <Card className="p-6 text-center">
            <span
              aria-hidden="true"
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-success-bg)]"
            >
              <Star className="h-7 w-7 fill-dune-400 text-dune-400" />
            </span>
            <h1 className="text-2xl">Thank you — genuinely</h1>
            <p className="mx-auto mt-2 max-w-md text-[0.95rem] leading-relaxed text-ink-600">
              Your review goes through moderation and appears within 24 hours.
              {dietaryMet === false && (
                <>
                  {" "}
                  You told us your dietary request wasn&apos;t met — that&apos;s already flagged to
                  our operations team and attached to the supplier&apos;s scorecard. Someone will
                  message you about a refund of the meal portion.
                </>
              )}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <ButtonLink href="/search">Plan your next trip</ButtonLink>
              <ButtonLink href="/account/inquiries" variant="outline">
                My inquiries
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <>
            <h1 className="text-[1.75rem] sm:text-3xl">How was it?</h1>
            <p className="mt-1.5 text-[0.95rem] text-ink-600">
              Two minutes. It genuinely changes which suppliers we keep selling.
            </p>

            {item && (
              <Card className="mt-5 flex items-center gap-3 p-4">
                <span className="h-14 w-16 shrink-0 overflow-hidden rounded-lg">
                  <Scene src={item.image} alt="" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-bold leading-snug text-ink-900">{item.title}</p>
                  <p className="text-xs text-ink-500">
                    {formatDateLong(item.date)} · booking {booking.reference}
                  </p>
                </div>
              </Card>
            )}

            <form onSubmit={submit} className="mt-5 space-y-6">
              <fieldset>
                <legend className="mb-2 text-sm font-bold text-ink-900">
                  Overall rating <span className="text-[var(--color-danger)]">*</span>
                </legend>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      aria-pressed={rating === n}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-shell"
                    >
                      <Star
                        className={cn(
                          "h-8 w-8 transition-colors",
                          n <= rating ? "fill-dune-400 text-dune-400" : "text-ink-300",
                        )}
                      />
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-bold text-ink-900">
                  Rate the parts that mattered
                </legend>
                <div className="space-y-2">
                  {SUB_RATINGS.map((sr) => (
                    <div key={sr.id} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-ink-700">{sr.label}</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-label={`${sr.label}: ${n} of 5`}
                            onClick={() => setSubRatings({ ...subRatings, [sr.id]: n })}
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-shell"
                          >
                            <Star
                              className={cn(
                                "h-5 w-5",
                                n <= (subRatings[sr.id] ?? 0)
                                  ? "fill-dune-400 text-dune-400"
                                  : "text-ink-300",
                              )}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              {booking.traveller.dietary && (
                <fieldset className="rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-success)_25%,white)] bg-[var(--color-success-bg)]/60 p-4">
                  <legend className="px-1 text-sm font-bold text-ink-900">
                    Was your{" "}
                    {booking.traveller.dietary === "jain" ? "Jain" : booking.traveller.dietary} meal
                    actually provided?
                  </legend>
                  <p className="mb-2.5 text-xs leading-relaxed text-ink-600">
                    We ask everyone this. A &ldquo;no&rdquo; goes straight to the supplier&apos;s
                    scorecard and triggers a refund of the meal portion.
                  </p>
                  <div className="flex gap-2">
                    {[
                      { value: true, label: "Yes, as described" },
                      { value: false, label: "No, it wasn't" },
                    ].map((o) => (
                      <button
                        key={String(o.value)}
                        type="button"
                        aria-pressed={dietaryMet === o.value}
                        onClick={() => setDietaryMet(o.value)}
                        className={cn(
                          "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors",
                          dietaryMet === o.value
                            ? "border-ink-900 bg-ink-900 text-white"
                            : "border-ink-300 bg-paper text-ink-700 hover:border-ink-900",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <div>
                <label htmlFor="title" className="mb-1 block text-sm font-bold text-ink-900">
                  Give it a headline
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Jain food was actually Jain"
                  className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
                />
              </div>

              <div>
                <label htmlFor="body" className="mb-1 block text-sm font-bold text-ink-900">
                  What should other travellers know?
                </label>
                <textarea
                  id="body"
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Was the pickup on time? Did the food match what was promised? Would it suit someone travelling with parents or small children?"
                  className="w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper p-3 text-[0.95rem] outline-none focus:border-ink-900"
                />
                <p className="mt-1 text-xs text-ink-500">
                  The most useful reviews mention the practical details, not just whether you enjoyed
                  it.
                </p>
              </div>

              <div className="rounded-[var(--radius-control)] border border-dashed border-ink-300 p-4 text-center">
                <Camera className="mx-auto mb-1.5 h-5 w-5 text-ink-400" aria-hidden="true" />
                <p className="text-sm font-semibold text-ink-700">Add up to 5 photos</p>
                <p className="text-xs text-ink-500">
                  Photo reviews get shown first, because they&apos;re the ones people trust.
                </p>
                <Button type="button" variant="outline" size="sm" className="mt-2">
                  Choose photos
                </Button>
              </div>

              {error && (
                <Alert tone="danger" title="Almost there">
                  {error}
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="lg" loading={state === "sending"}>
                  Submit review
                </Button>
                <WhatsAppButton
                  variant="ghost"
                  label="Something went wrong on the trip"
                  context={{
                    intent: "booking_support",
                    bookingReference: booking.reference,
                    placement: "review_form",
                  }}
                />
              </div>
              <p className="text-xs text-ink-500">
                Reviews are moderated within 24 hours and published under your first name and city.
                See our{" "}
                <Link href="/terms" className="font-bold text-sun-700 underline">
                  review policy
                </Link>
                .
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

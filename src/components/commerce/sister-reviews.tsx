import { Star } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { SISTER_BRAND, SISTER_REVIEWS_CAPTURED_ON, sisterReviewStats, sisterReviews } from "@/lib/data/sister-reviews";
import { siteConfig } from "@/lib/site-config";
import type { SisterReview } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Google reviews of **Holiday Planner**, the sister company in the same group.
 *
 * OUTLYY is new and has no reviews of its own. Rather than invent them, the
 * group's real ones are shown — and labelled, every single time, in the
 * heading, in the lead paragraph and on each card. The rules this component
 * exists to enforce:
 *
 *  - the brand being reviewed is named before any review is read
 *  - nothing here is ever attached to an OUTLYY listing or price
 *  - no star rating for OUTLYY is derived from them, and no
 *    schema.org AggregateRating is emitted (that would be a false claim about
 *    OUTLYY's own product — the thing the CCPA's 2023 fake-review rule and
 *    UAE Consumer Protection Law 15/2020 both prohibit)
 *  - reviewers are first name + initial, with no profile links and no photos,
 *    because we have permission for neither
 *
 * `NEXT_PUBLIC_SISTER_REVIEWS_URL` is the public Google listing. Until it is
 * set the "read them on Google" link simply does not render — an unverifiable
 * claim is worse than no link.
 */

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i < value ? "fill-sun-500 text-sun-500" : "text-ink-300")} aria-hidden="true" />
      ))}
    </span>
  );
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function SisterReviewCard({ review, className }: { review: SisterReview; className?: string }) {
  return (
    <Card className={cn("flex h-full flex-col p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <Stars value={review.rating} />
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-500">{SISTER_BRAND.name}</span>
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-800">{review.body}</p>
      <p className="mt-3 text-xs text-ink-500">
        {review.author} · {review.branch} office · {monthLabel(review.month)}
      </p>
    </Card>
  );
}

/**
 * The labelled block. `limit` keeps the homepage rail short; the reviews page
 * shows everything published.
 */
export function SisterBrandReviews({ limit, className }: { limit?: number; className?: string }) {
  const shown = limit ? sisterReviews.slice(0, limit) : sisterReviews;
  if (!shown.length) return null;
  const listing = siteConfig.sisterReviewsUrl;
  const captured = new Date(`${SISTER_REVIEWS_CAPTURED_ON}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <section className={cn("", className)} aria-labelledby="sister-reviews">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-sun-600">Reviews of our sister company</p>
      <h2 id="sister-reviews" className="mt-1 text-2xl sm:text-[1.75rem]">
        What travellers say about {SISTER_BRAND.name}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-700">
        OUTLYY is new, so it has no reviews yet — and we would rather show you nothing of our own than
        make some up. These {sisterReviewStats.total} Google reviews belong to{" "}
        <strong>{SISTER_BRAND.name}</strong>, {SISTER_BRAND.relationship}, which has been running trips
        from {SISTER_BRAND.offices.join(", ")} for years. They are about Holiday Planner&rsquo;s service,
        not about anything you would book here. The same team answers your WhatsApp messages.
      </p>
      <p className="mt-1 text-xs text-ink-500">
        {sisterReviewStats.average} average across {sisterReviewStats.total} reviews, as exported on {captured}.
        Names are shortened and photographs left out because we do not have the reviewers&rsquo; permission to republish them.
        {listing && (
          <>
            {" "}
            <a href={listing} target="_blank" rel="noreferrer noopener" className="font-semibold underline underline-offset-2">
              Read them on Google
            </a>
            .
          </>
        )}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r, i) => (
          <SisterReviewCard key={`${r.author}-${r.month}-${i}`} review={r} />
        ))}
      </div>
    </section>
  );
}

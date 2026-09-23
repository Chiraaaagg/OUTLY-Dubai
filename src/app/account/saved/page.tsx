"use client";

import { Heart, Share2 } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { ActivityCard } from "@/components/commerce/activity-card";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, SkeletonGrid } from "@/components/ui/primitives";
import { useCatalog } from "@/lib/catalog/client";
import type { Activity } from "@/lib/types";

/**
 * WISHLIST (PRD §5.10)
 *
 * Guest wishlist lives in localStorage and merges on login. The share link is
 * the point of this feature, not a nice-to-have: Persona A shares a shortlist
 * with his wife before anyone books anything, and that conversation is where
 * the decision actually happens.
 */
export default function SavedPage() {
  const { wishlist, hydrated, toast, currency } = useApp();
  const { activities } = useCatalog();
  const activityBySlug = (slug: string) => activities.find((a) => a.slug === slug);
  const saved = wishlist.map(activityBySlug).filter((a): a is Activity => Boolean(a));
  const total = saved.reduce((sum, a) => sum + a.price.adult.inr, 0);

  const share = async () => {
    const url = `${window.location.origin}/account/saved?list=${wishlist.join(",")}`;
    if (navigator.share) {
      await navigator.share({ title: "My Dubai shortlist", url });
    } else {
      await navigator.clipboard?.writeText(url);
      toast({ tone: "success", title: "Link copied", body: "Send it to whoever's deciding with you." });
    }
  };

  if (!hydrated) return <SkeletonGrid count={6} />;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl">Saved activities</h2>
          <p className="mt-1 text-sm text-ink-600">
            {saved.length
              ? `${saved.length} saved · about ₹${total.toLocaleString("en-IN")} for one adult across all of them`
              : "Tap the heart on any activity to keep it here."}
          </p>
        </div>
        {saved.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void share()}>
              <Share2 className="h-4 w-4" />
              Share this list
            </Button>
            <WhatsAppButton
              size="sm"
              label="Price this list"
              context={{
                intent: "group",
                question: `Please price these for my group: ${saved.map((a) => a.title).join(" / ")}`,
                placement: "wishlist",
              }}
            />
          </div>
        )}
      </div>

      {saved.length === 0 ? (
        <EmptyState
          illustration="saved"
          icon={<Heart className="h-6 w-6" />}
          title="Nothing saved yet"
          body="Save the ones you're considering and share the list with whoever you're travelling with. We'll tell you if a price drops or availability gets tight."
          action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          secondary={
            <ButtonLink href="/collections/first-time-dubai" variant="outline">
              See the first-timer plan
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {saved.map((a, i) => (
            <ActivityCard
              key={a.slug}
              activity={a}
              position={i + 1}
              source="wishlist"
              showCompare
              showWhatsApp
            />
          ))}
        </div>
      )}

      {saved.length > 0 && saved.length < 3 && (
        <section className="mt-10">
          <h3 className="mb-4 text-xl">Often saved alongside these</h3>
          <div className="grid gap-5 sm:grid-cols-3">
            {activities
              .filter((a) => !wishlist.includes(a.slug) && a.tier === "B")
              .slice(0, 3)
              .map((a, i) => (
                <ActivityCard
                  key={a.slug}
                  activity={a}
                  layout="compact"
                  position={i + 1}
                  source="wishlist_suggestions"
                />
              ))}
          </div>
        </section>
      )}
    </>
  );
}

"use client";

import { Copy, Gift, Share2, Wallet } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Alert, Card, Stat } from "@/components/ui/primitives";
import { track } from "@/lib/analytics";
import { demoUser } from "@/lib/data/bookings";

/**
 * REFERRAL DASHBOARD (PRD §5.12)
 *
 * Give ₹500, get ₹500 — credited only after the referee has actually travelled
 * and no refund was issued (AC-REF-01). We state that rule on the page rather
 * than burying it, because "why haven't I got my credit" is otherwise the most
 * common support ticket a referral programme generates.
 */
export default function ReferralsPage() {
  const { toast } = useApp();
  const link = `https://outly.in/?ref=${demoUser.referralCode}`;

  const copy = async () => {
    await navigator.clipboard?.writeText(link);
    track("referral_clicked", { page_type: "referral_dashboard" });
    toast({ tone: "success", title: "Referral link copied" });
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="sun-wash p-6">
            <Gift className="mb-2 h-7 w-7 text-sun-600" aria-hidden="true" />
            <h2 className="text-2xl">Give ₹500, get ₹500</h2>
            <p className="mt-1.5 max-w-md text-[0.95rem] leading-relaxed text-ink-700">
              Your friend gets ₹500 off their first booking. You get ₹500 in credit once
              they&apos;ve actually travelled — not when they book, because bookings get cancelled
              and credit that disappears again is worse than no credit.
            </p>
          </div>
          <div className="p-6">
            <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">Your code</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="font-display text-3xl font-bold tnum text-ink-900">
                {demoUser.referralCode}
              </p>
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const text = `I booked our Dubai activities through OUTLY — all-in rupee pricing and they answer on WhatsApp. Use ${demoUser.referralCode} for ₹500 off: ${link}`;
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(text)}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                  track("referral_clicked", { page_type: "whatsapp_share" });
                }}
              >
                <Share2 className="h-4 w-4" />
                Share on WhatsApp
              </Button>
            </div>
            <p className="mt-3 break-all text-xs text-ink-500">{link}</p>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-lagoon-500" aria-hidden="true" />
            Your credits
          </h2>
          <p className="mt-3 font-display text-4xl font-bold tnum text-ink-900">
            ₹{demoUser.credits.inr.toLocaleString("en-IN")}
          </p>
          <p className="mt-1 text-sm text-ink-600">
            Applied automatically at checkout, up to 20% of an order. Expires 12 months after it was
            earned — we&apos;ll warn you 30 days before.
          </p>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5 sm:grid-cols-4">
        <Stat value={String(demoUser.referrals.invited)} label="Friends invited" />
        <Stat value={String(demoUser.referrals.booked)} label="Have booked" />
        <Stat value={`₹${demoUser.referrals.earned.toLocaleString("en-IN")}`} label="Credit earned" />
        <Stat value={`₹${demoUser.referrals.pending.toLocaleString("en-IN")}`} label="Pending travel" />
      </div>

      <Alert tone="info" className="mt-6" title="How the credit actually works">
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Your friend must be a new customer and book at least ₹3,000 of activities.</li>
          <li>Credit is released after their activity date has passed and no refund was issued.</li>
          <li>Up to 10 successful referrals per year. Self-referrals are detected and blocked.</li>
          <li>Credits can cover up to 20% of a future order and expire after 12 months.</li>
        </ul>
      </Alert>
    </>
  );
}

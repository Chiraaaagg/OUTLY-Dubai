"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, Copy, Phone, Plus } from "lucide-react";
import { ActivityCard } from "@/components/commerce/activity-card";
import { AgentCard, NextSteps } from "@/components/commerce/inquiry-ui";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { useApp } from "@/components/providers/app-provider";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Card, Skeleton } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { track } from "@/lib/analytics";
import { useCatalog } from "@/lib/catalog/client";
import { agents, formatDeadline } from "@/lib/inquiry";
import { emergencyDisplay, emergencyHref } from "@/lib/site-config";
import type { Agent, CartItem, PaxCount } from "@/lib/types";
import { formatDateKey, paxLabel, priceIn } from "@/lib/utils";

interface StoredInquiry {
  reference: string;
  slaDueAt: string;
  agent: Agent;
  outOfHours: boolean;
  items: CartItem[];
  name: string;
  phone: string;
  total: { inr: number; aed: number };
  flexible: boolean;
  date: string;
  pax: PaxCount;
}

/**
 * INQUIRY CONFIRMATION — the strongest placement for the response promise
 * (pivot §3.9): a named human plus a concrete deadline, not a duration.
 *
 * Post-submit silence is drop-off risk #3. The page answers, in order: it was
 * received (reference), who has it (agent), when they'll reply (timestamp),
 * what happens next (timeline), and how to reach us now (WhatsApp with the
 * reference pre-filled — the primary CTA here per §4.2).
 *
 * "What happens next" adapted from 21st.dev "Vertical How It Works Timeline"
 * (@ln-dev7/how-it-works-02).
 */
export default function InquiryConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-10">
          <Skeleton className="h-96 w-full rounded-[var(--radius-tile)]" />
        </div>
      }
    >
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const { activities } = useCatalog();
  const emergency = emergencyDisplay();
  const emergencyTel = emergencyHref();
  const { currency, toast } = useApp();
  const [stored, setStored] = useState<StoredInquiry | null>(null);
  const reference = params.get("ref") ?? "INQ-000000";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("outlyy.lastInquiry");
      if (raw) setStored(JSON.parse(raw) as StoredInquiry);
    } catch {
      /* page still works from the reference alone */
    }
    track("page_view", { page_type: "inquiry_confirmation", inquiry_reference: reference });
  }, [reference]);

  const agent = stored?.agent ?? agents[0];
  const deadline = stored ? new Date(stored.slaDueAt) : new Date(Date.now() + 30 * 60000);
  const outOfHours = stored?.outOfHours ?? false;
  const crossSell = activities.filter((a) => a.tier === "B").slice(0, 3);

  return (
    <div className="container-page py-8 pb-20">
      <div className="mx-auto max-w-3xl">
        {/* Received */}
        <div className="rounded-[var(--radius-tile)] border border-[color-mix(in_oklab,var(--color-success)_30%,white)] bg-[var(--color-success-bg)] p-6 text-center sm:p-8">
          <span
            aria-hidden="true"
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white"
          >
            <CheckCircle2 className="h-7 w-7 text-[var(--color-success)]" />
          </span>
          <h1 className="text-[1.75rem] sm:text-3xl">Got it. {agent.name.split(" ")[0]} has your trip.</h1>
          <p className="mx-auto mt-2 max-w-xl text-[0.975rem] leading-relaxed text-ink-700">
            {outOfHours
              ? `Our team is offline right now. ${agent.name.split(" ")[0]} will message you on WhatsApp by ${formatDeadline(deadline)} with availability and the confirmed price.`
              : `You'll hear from ${agent.name.split(" ")[0]} on WhatsApp by ${formatDeadline(deadline)} — with availability confirmed and the exact all-in price. Nothing is charged until you say yes.`}
          </p>

          <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-ink-200 bg-white px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Reference</span>
            <span className="font-display text-lg font-bold tnum text-ink-900">{reference}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(reference);
                toast({ tone: "success", title: "Reference copied" });
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100"
            >
              <Copy className="h-4 w-4" />
              <span className="sr-only">Copy reference</span>
            </button>
          </div>
        </div>

        {/* Named human + deadline — the highest-value trust element (§3.5) */}
        <AgentCard agent={agent} deadline={deadline} className="mt-5" />

        {/* Primary CTA: WhatsApp with the reference pre-filled (§4.2) */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <WhatsAppButton
            block
            size="lg"
            context={{
              intent: "inquiry_followup",
              inquiryReference: reference,
              placement: "inquiry_confirmation",
            }}
            label={`Message ${agent.name.split(" ")[0]} on WhatsApp`}
          />
          <ButtonLink href="/search" variant="outline" size="lg" block>
            <Plus className="h-[1.15rem] w-[1.15rem]" />
            Add another activity
          </ButtonLink>
        </div>

        {/* What happens next */}
        <Card className="mt-6 p-5 sm:p-6">
          <h2 className="mb-4 text-xl">What happens next</h2>
          <NextSteps agentName={agent.name.split(" ")[0]} deadline={deadline} />
        </Card>

        {/* What we're checking */}
        {stored && (
          <Card className="mt-6 p-5">
            <h2 className="text-xl">What we&apos;re checking for you</h2>
            <p className="mt-1 text-sm text-ink-600">
              {stored.flexible ? "Dates flexible" : formatDateKey(stored.date)} · {paxLabel(stored.pax)}
              {stored.phone ? ` · replying to ${stored.phone}` : ""}
            </p>
            {stored.items.length > 0 ? (
              <>
                <ul className="mt-3 divide-y divide-ink-200">
                  {stored.items.map((item) => (
                    <li key={item.id} className="flex gap-3 py-3">
                      <span className="h-14 w-16 shrink-0 overflow-hidden rounded-lg">
                        <Scene src={item.image} alt="" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-snug text-ink-900">{item.title}</p>
                        <p className="text-xs text-ink-500">
                          {formatDateKey(item.date)} · {item.time}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold tnum">{priceIn(item.total, currency)}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-ink-200 pt-3 text-sm">
                  <span className="font-bold">Indicative total</span>
                  <span className="font-display text-lg font-bold tnum">
                    {priceIn(stored.total, currency)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  If the confirmed price differs, {agent.name.split(" ")[0]} tells you the old and new
                  figure and why. You decide.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-600">
                No specific activities yet — {agent.name.split(" ")[0]} will suggest a plan around your
                dates and group.
              </p>
            )}
          </Card>
        )}

        {/* Reach us now */}
        <Card className="mt-6 p-5">
          <h2 className="flex items-center gap-2 text-lg">
            <Phone className="h-5 w-5 text-sun-500" aria-hidden="true" />
            Travelling in the next 48 hours?
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
            Message us on WhatsApp rather than waiting — it&apos;s faster
            {emergency ? ", and for anything urgent the phone line is answered by a person." : "."}
          </p>
          {emergency && emergencyTel && (
            <a href={emergencyTel} className="mt-2 inline-block text-sm font-bold text-ink-900 underline">
              {emergency}
            </a>
          )}
        </Card>

        {outOfHours && (
          <Alert tone="info" className="mt-6" title="Out of hours">
            Your inquiry is queued for the first shift. The deadline above already accounts for that —
            it is the real time, not an estimate.
          </Alert>
        )}

        <section className="mt-8">
          <h2 className="mb-1 text-xl">While you wait</h2>
          <p className="mb-4 text-sm text-ink-600">
            Add these to the same inquiry — {agent.name.split(" ")[0]} will price them together, which
            is usually cheaper.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {crossSell.map((a, i) => (
              <ActivityCard key={a.slug} activity={a} layout="compact" position={i + 1} source="inquiry_confirmation" />
            ))}
          </div>
        </section>

        <p className="mt-8 text-center text-sm text-ink-600">
          Track this inquiry in{" "}
          <Link href="/account/inquiries" className="font-bold text-sun-700 underline underline-offset-2">
            My inquiries
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { CheckCircle2, Clock, MessageCircle, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CONFIRM_FIRST, formatDeadline, isWithinBusinessHours, SLA } from "@/lib/inquiry";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Inquiry-mode UI primitives shared across ADP, cart, form and confirmation.
 *
 * Every element here traces back to one sentence (pivot §3.1): "We confirm
 * with the operator before you pay — so you never get a voucher that fails at
 * the gate." The pieces exist to answer the four new objections (§3.4) at the
 * exact point each one fires.
 */

/* ---------------------------------------------------------------------------
 * "Why can't I just book?" — one line beside the CTA
 * ------------------------------------------------------------------------ */

export function ConfirmFirstNote({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs leading-relaxed text-ink-600",
        compact && "text-2xs",
        className,
      )}
    >
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lagoon-500" aria-hidden="true" />
      <span>{CONFIRM_FIRST}</span>
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * "How long will this take?" — a concrete promise that adapts out of hours
 * (pivot §3.9 rule 2). Renders "~30 min" in hours, the real time otherwise.
 * ------------------------------------------------------------------------ */

export function ResponsePromise({
  className,
  prefix = "Free to ask",
}: {
  className?: string;
  prefix?: string;
}) {
  const open = isWithinBusinessHours();
  return (
    <p className={cn("flex items-center gap-1.5 text-xs font-semibold text-ink-700", className)}>
      <Clock className="h-3.5 w-3.5 shrink-0 text-sun-500" aria-hidden="true" />
      {open
        ? `${prefix} · reply in ~${SLA.responseMinutes} min`
        : `${prefix} · team offline now, first reply after 9 am IST`}
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * Named agent — the trust element an OTA structurally cannot copy (§3.5).
 * Adapted from the 21st.dev "Profile Card" (@waleedkibhen/profile-card) —
 * avatar, name, role, activity line, single action — rebuilt on OUTLY tokens
 * with an initials avatar until real photos exist.
 * ------------------------------------------------------------------------ */

export function AgentCard({
  agent,
  deadline,
  className,
}: {
  agent: Agent;
  deadline?: Date;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sun-100 font-display text-lg font-bold text-sun-700 ring-2 ring-sun-200"
      >
        {agent.initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] font-bold leading-tight text-ink-900">{agent.name}</p>
        <p className="text-xs text-ink-600">
          {agent.role} · {agent.languages.join(", ")}
        </p>
        {deadline && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[var(--color-success)]">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Will message you by {formatDeadline(deadline)}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * How it works — 3 numbered steps + connector + CTA.
 * Adapted from 21st.dev "How It Works Steps" (@ln-dev7/how-it-works-09):
 * numbered circles, a horizontal connector line, typography does the work.
 * Used on the homepage (pivot §2.1) so the inquiry model is explained before
 * the first CTA is met.
 * ------------------------------------------------------------------------ */

const STEPS = [
  {
    title: "Pick what you like",
    body: "Browse all-in rupee prices. Add one experience or a whole week.",
  },
  {
    title: "Tell us your dates",
    body: "Name and WhatsApp number. Thirty seconds, no account, no payment.",
  },
  {
    title: "We confirm, then you pay",
    body: "A named person checks availability with the operator and replies in about 30 minutes with a confirmed price.",
  },
] as const;

export function HowItWorks({
  className,
  compact,
  cta = true,
}: {
  className?: string;
  compact?: boolean;
  cta?: boolean;
}) {
  return (
    <section
      className={cn("rounded-[var(--radius-tile)] border border-ink-200 bg-paper", compact ? "p-5" : "p-6 sm:p-8", className)}
      aria-labelledby="how-it-works"
    >
      <div className={cn("mb-5 text-center", compact && "mb-4")}>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-sun-600">
          How OUTLY works
        </p>
        <h2 id="how-it-works" className={cn("mt-1", compact ? "text-xl" : "text-2xl sm:text-[1.75rem]")}>
          Nothing is charged until the operator confirms
        </h2>
      </div>

      <ol className="relative grid gap-6 sm:grid-cols-3 sm:gap-4">
        {/* Connector — behind the circles on sm+ */}
        <span
          aria-hidden="true"
          className="absolute left-[16.6%] right-[16.6%] top-5 hidden h-px bg-ink-200 sm:block"
        />
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative flex gap-3 sm:flex-col sm:items-center sm:text-center">
            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink-900 bg-paper font-display text-sm font-extrabold text-ink-900">
              {i + 1}
            </span>
            <div>
              <h3 className="text-[0.975rem] leading-snug">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {cta && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <ButtonLink href="/search" size="lg">
            Plan my Dubai trip
          </ButtonLink>
          <ConfirmFirstNote className="max-w-md justify-center text-center" />
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * What happens next — vertical timeline for the confirmation page.
 * Adapted from 21st.dev "Vertical How It Works Timeline"
 * (@ln-dev7/how-it-works-02): dashed rail, numbered nodes, one icon per step.
 * ------------------------------------------------------------------------ */

export function NextSteps({
  agentName,
  deadline,
  className,
}: {
  agentName: string;
  deadline: Date;
  className?: string;
}) {
  const steps = [
    {
      title: "Acknowledgement on WhatsApp",
      body: "Sent now, with your reference. If it hasn't arrived in two minutes, check the number you gave us.",
      done: true,
    },
    {
      title: `${agentName} checks with the operator`,
      body: "Availability on your dates, the confirmed all-in price, and anything you flagged — dietary, mobility, pickup.",
      done: false,
    },
    {
      title: `Reply by ${formatDeadline(deadline)}`,
      body: "Usually three options: what you asked for, a better variant, and a package if it saves you money.",
      done: false,
    },
    {
      title: "You decide, then pay",
      body: "A secure payment link on WhatsApp — UPI, card or EMI. Nothing is charged before you say yes.",
      done: false,
    },
  ];

  return (
    <ol className={cn("relative space-y-0", className)}>
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-4">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-bold",
                s.done
                  ? "border-[var(--color-success)] bg-[var(--color-success)] text-white"
                  : "border-ink-900 bg-paper text-ink-900",
              )}
            >
              {s.done ? <CheckCircle2 className="h-4.5 w-4.5" /> : i + 1}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="my-1 w-0 flex-1 border-l-2 border-dashed border-ink-200" />
            )}
          </div>
          <div className="pb-6">
            <h3 className="text-[0.975rem] leading-snug">{s.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------------------
 * Indicative price note — "Will the price change?" (§3.4)
 * ------------------------------------------------------------------------ */

export function IndicativePriceNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-ink-600", className)}>
      This is the all-in price we expect to confirm. If anything changes, we tell you before you pay
      anything.{" "}
      <Link href="/faq#inquiry" className="font-bold text-sun-700 underline underline-offset-2">
        How it works
      </Link>
    </p>
  );
}

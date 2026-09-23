"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Phone, Sparkles, UserCheck } from "lucide-react";
import { ActivityCard } from "@/components/commerce/activity-card";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { Button } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card, SectionHeading, Skeleton } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { track } from "@/lib/analytics";
import { requestQuote } from "@/lib/api";
import { useCatalog } from "@/lib/catalog/client";
import { emergencyDisplay, emergencyHref } from "@/lib/site-config";
import { cn } from "@/lib/utils";

/**
 * CONCIERGE / REQUEST A QUOTE (Persona C)
 *
 * A lead form, not a cart. Mr. Khanna will not use self-serve, judges
 * credibility in the first thirty seconds, and often delegates to an assistant
 * who will phone. So: premium treatment, a named-coordinator promise, a
 * two-hour response commitment, and a phone number that a person answers.
 */
export default function ConciergePage() {
  return (
    <Suspense fallback={<div className="container-page py-10"><Skeleton className="h-96 w-full rounded-[var(--radius-tile)]" /></div>}>
      <ConciergeInner />
    </Suspense>
  );
}

function ConciergeInner() {
  const params = useSearchParams();
  const { activities } = useCatalog();
  const sku = params.get("sku");
  const prefilled = sku ? activities.find((a) => a.slug === sku) : undefined;
  const deskPhone = emergencyDisplay();
  const deskPhoneHref = emergencyHref();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    dates: "",
    guests: "2",
    budget: "",
    notes: prefilled ? `Interested in: ${prefilled.title}` : "",
  });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const premium = activities.filter((a) => a.tier === "D" || a.tier === "C").slice(0, 3);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setState("sending");
    try {
      await requestQuote({
        name: form.name,
        phone: form.phone,
        activity: prefilled?.title,
        dates: form.dates,
        guests: form.guests,
        notes: form.notes,
      });
      track("quote_requested", {
        activity_slug: sku ?? undefined,
        guest_count: Number(form.guests),
        rail: "assisted",
      });
      setState("sent");
    } catch {
      setState("error");
    }
  };

  return (
    <>
      <section className="night-wash relative overflow-hidden border-b border-ink-800">
        <div className="absolute inset-0 opacity-40">
          <Scene src="luxury-night" alt="" />
        </div>
        <div className="container-page relative py-14 text-white sm:py-20">
          <Breadcrumbs
            items={[{ label: "Dubai", href: "/" }, { label: "Concierge" }]}
            className="mb-4 [&_a]:text-white/60 [&_span]:text-white"
          />
          <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-dune-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Private itineraries & charters
          </p>
          <h1 className="max-w-3xl text-[2.1rem] leading-tight text-white sm:text-5xl">
            Tell us what you want. A named person arranges it.
          </h1>
          <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-white/80">
            Private yacht charters, helicopter flights, exclusive desert camps, chauffeured days and
            full multi-day itineraries. You get one coordinator with a direct WhatsApp and phone
            number, from the first enquiry until you&apos;re back at your hotel — and a firm all-in
            quote within two hours.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {deskPhone && deskPhoneHref && (
              <a
                href={deskPhoneHref}
                className="inline-flex min-h-13 items-center gap-2 rounded-[var(--radius-control)] bg-white px-5 font-bold text-ink-900"
              >
                <Phone className="h-[1.15rem] w-[1.15rem]" />
                {deskPhone}
              </a>
            )}
            <WhatsAppButton
              size="lg"
              variant="whatsapp"
              context={{ intent: "concierge", placement: "concierge_hero" }}
            />
          </div>
        </div>
      </section>

      <div className="container-page grid grid-safe gap-8 py-12 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <Card className="p-6">
          <h2 className="text-2xl">Request a quote</h2>
          <p className="mt-1.5 text-sm text-ink-600">
            Six fields. We come back within two hours during working hours with a firm, itemised
            all-in figure — not a range that changes later.
          </p>

          {prefilled && (
            <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-control)] bg-shell p-3">
              <span className="h-12 w-14 shrink-0 overflow-hidden rounded-lg">
                <Scene src={prefilled.images[0]} alt="" />
              </span>
              <div className="min-w-0">
                <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                  Quoting for
                </p>
                <p className="truncate text-sm font-bold text-ink-900">{prefilled.title}</p>
              </div>
            </div>
          )}

          {state === "sent" ? (
            <Alert tone="success" className="mt-5" title="Request received">
              <p>
                A coordinator will call you on {form.phone} within two hours during working hours,
                with a written quote following on WhatsApp and email. If you need it sooner, message
                us directly and mention this request.
              </p>
              <div className="mt-3">
                <WhatsAppButton
                  size="sm"
                  context={{ intent: "concierge", placement: "concierge_success" }}
                />
              </div>
            </Alert>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Your name"
                  id="c-name"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  required
                />
                <Input
                  label="Phone"
                  id="c-phone"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  hint="We'll call this number."
                  required
                />
              </div>
              <Input
                label="Email"
                id="c-email"
                type="email"
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Dates in Dubai"
                  id="c-dates"
                  value={form.dates}
                  onChange={(v) => setForm({ ...form, dates: v })}
                  hint="Approximate is fine."
                />
                <Input
                  label="Number of guests"
                  id="c-guests"
                  value={form.guests}
                  onChange={(v) => setForm({ ...form, guests: v })}
                />
              </div>
              <Input
                label="Budget (optional)"
                id="c-budget"
                value={form.budget}
                onChange={(v) => setForm({ ...form, budget: v })}
                hint="Helps us quote the right boat or aircraft first time."
              />
              <div>
                <label htmlFor="c-notes" className="mb-1 block text-sm font-bold text-ink-900">
                  What are you looking for?
                </label>
                <textarea
                  id="c-notes"
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Private yacht for an anniversary · full-day chauffeur · Jain catering on board · proposal setup"
                  className="w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper p-3 text-[0.95rem] outline-none focus:border-ink-900"
                />
              </div>

              {state === "error" && (
                <Alert tone="danger" title="That didn't send">
                  Try again{deskPhone ? `, or call us directly on ${deskPhone}` : ", or message us on WhatsApp"}{" "}
                  — nothing you typed is lost.
                </Alert>
              )}

              <Button type="submit" size="lg" block loading={state === "sending"}>
                Request my quote
              </Button>
              <p className="text-center text-xs text-ink-500">
                No payment, no obligation. We&apos;ll tell you honestly if what you want isn&apos;t
                possible on your dates.
              </p>
            </form>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-lg">What you get</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {[
                {
                  icon: UserCheck,
                  title: "A named coordinator",
                  body: "Direct WhatsApp and phone, from enquiry to drop-off. Your assistant deals with the same person throughout.",
                },
                {
                  icon: Clock,
                  title: "A quote in two hours",
                  body: "Firm, itemised, all-in. Not a range that moves once you commit.",
                },
                {
                  icon: CheckCircle2,
                  title: "Suppliers we actually use",
                  body: "Every operator is scored monthly on on-time performance, rejection rate and complaints.",
                },
                {
                  icon: Sparkles,
                  title: "Occasions handled properly",
                  body: "Cake, décor, a photographer briefed on where to stand, a proposal set up away from the crowd. No planning fee.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <item.icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-sun-500" aria-hidden="true" />
                  <span>
                    <strong className="block font-bold text-ink-900">{item.title}</strong>
                    <span className="text-ink-600">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg">Invoicing</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
              GST-compliant invoices with company billing details as standard, issued the same day.
              Bank transfer accepted for corporate bookings.
            </p>
          </Card>
        </div>
      </div>

      <section className="container-page pb-16">
        <SectionHeading
          kicker="Frequently arranged"
          title="Premium experiences we book most"
          href="/categories/luxury-experiences"
        />
        <div className="grid gap-5 sm:grid-cols-3">
          {premium.map((a, i) => (
            <ActivityCard key={a.slug} activity={a} position={i + 1} source="concierge" />
          ))}
        </div>
      </section>
    </>
  );
}

function Input({
  label,
  id,
  value,
  onChange,
  hint,
  type = "text",
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-ink-900">
        {label} {required && <span className="text-[var(--color-danger)]">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900",
        )}
      />
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

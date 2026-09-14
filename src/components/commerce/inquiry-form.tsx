"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Send } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { DateField, DatePickerSheet, GuestField, GuestSheet } from "./pickers";
import { WhatsAppButton } from "./whatsapp";
import { ConfirmFirstNote, ResponsePromise } from "./inquiry-ui";
import { ApiError, submitInquiry } from "@/lib/api";
import { track } from "@/lib/analytics";
import { BUDGET_BANDS, SLA } from "@/lib/inquiry";
import type { BudgetBand, CartItem, Dietary, PaxCount } from "@/lib/types";
import { cn, EMPTY_PAX, formatDateKey, paxLabel, paxTotal, priceIn, toDateKey } from "@/lib/utils";

/**
 * INQUIRY FORM — the most important conversion surface in inquiry mode.
 *
 * Pattern sources (docs/backend/17-inquiry-mode-pivot.md §2):
 *  - 21st.dev "Support Ticket Form" (@cnippet-dev/v-textarea-10): selectable
 *    chips instead of selects, textarea with live count, loading submit.
 *  - 21st.dev "Multi-Field Form" (@cnippet-dev/v-field-17): inline validation
 *    on submit, error adjacent to the field.
 *  - 21st.dev "Centered Contact Form" (@ln-dev7/contact-16): the swap-in-place
 *    submitted state — here routed to /inquiry/confirmation so it survives a
 *    refresh and carries the reference.
 * Reimplemented on OUTLY tokens with CSS-only motion and 44px targets.
 *
 * FIELD JUSTIFICATION — every field must earn its place by making the agent's
 * first reply materially better (pivot §3.3). Two are required.
 *
 *  | Field           | Required | Why it exists                                                                 |
 *  |-----------------|----------|-------------------------------------------------------------------------------|
 *  | Name            | yes      | The agent opens with it; a nameless lead reads as spam                        |
 *  | WhatsApp number | yes      | The channel. Nothing works without it                                         |
 *  | Dates           | no       | Pre-filled from cart; "flexible" allowed — a date-unsure buyer is still a lead |
 *  | Guests          | no       | Pre-filled from cart; decides price and vehicle. Approximate is fine           |
 *  | Dietary         | no       | The wedge. One tap; changes which supplier the agent quotes                   |
 *  | Email           | no       | Fallback channel only                                                          |
 *  | Hotel           | no       | Decides pickup coverage; usually unknown this early                            |
 *  | Budget band     | no       | Lets the agent quote the right tier first time                                 |
 *  | Notes           | no       | Parents, occasions, mobility — the things that decide the recommendation      |
 *
 * Removed versus the old checkout: payment method, deposit, EMI, coupon,
 * terms checkbox, billing. None are needed to start a conversation.
 */

const DIETARY_OPTIONS: { id: Dietary; label: string }[] = [
  { id: "veg", label: "Pure veg" },
  { id: "jain", label: "Jain" },
  { id: "halal", label: "Halal" },
  { id: "non-veg", label: "No restriction" },
];

const NOTES_MAX = 500;

export function InquiryForm({
  items,
  source = "inquiry_form",
  className,
}: {
  items: CartItem[];
  source?: "inquiry_form" | "quote_request";
  className?: string;
}) {
  const router = useRouter();
  const { currency, clearCart } = useApp();

  // Pre-fill from browsing context so re-entry is zero (pivot §3.6).
  const firstItem = items[0];
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState(firstItem?.date ?? toDateKey(new Date()));
  const [flexible, setFlexible] = useState(!firstItem);
  const [pax, setPax] = useState<PaxCount>(firstItem?.pax ?? EMPTY_PAX);
  const [dietary, setDietary] = useState<Dietary | undefined>(undefined);
  const [hotel, setHotel] = useState("");
  const [budget, setBudget] = useState<BudgetBand | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const honeypot = useRef("");
  const startedAt = useRef(Date.now());

  useEffect(() => {
    track("inquiry_started", {
      item_count: items.length,
      value: items.reduce((s, i) => s + i.total.inr, 0),
      inquiry_source: source,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = useMemo(
    () =>
      items.reduce(
        (sum, i) => ({ inr: sum.inr + i.total.inr, aed: sum.aed + i.total.aed }),
        { inr: 0, aed: 0 },
      ),
    [items],
  );

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "So we know who to reply to.";
    if (!/^\d{7,12}$/.test(phone.replace(/\s/g, "")))
      next.phone = "We reply on WhatsApp — this is the one thing we genuinely need.";
    setErrors(next);
    Object.keys(next).forEach((field) =>
      track("inquiry_field_error", { field, failure_reason: next[field] }),
    );
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setState("sending");
    setError(null);
    try {
      const result = await submitInquiry({
        items,
        leadName: name.trim(),
        leadPhone: phone.replace(/\s/g, ""),
        countryCode,
        leadEmail: email.trim() || undefined,
        travelDateFrom: flexible ? undefined : date,
        datesFlexible: flexible,
        pax,
        hotel: hotel.trim() || undefined,
        dietary,
        specialRequests: notes.trim() || undefined,
        budgetBand: budget,
        currency,
        source,
        whatsappConsent: consent,
        honeypot: honeypot.current,
        startedAt: startedAt.current,
      });

      track("inquiry_submitted", {
        inquiry_reference: result.reference,
        inquiry_source: source,
        item_count: items.length,
        value: total.inr,
        currency: "INR",
        guest_count: paxTotal(pax),
        selected_date: flexible ? "flexible" : date,
        rail: "assisted",
      });

      sessionStorage.setItem(
        "outly.lastInquiry",
        JSON.stringify({
          ...result,
          items,
          name: name.trim(),
          phone: `${countryCode} ${phone}`,
          total,
          flexible,
          date,
          pax,
          dietary,
        }),
      );
      clearCart();
      router.push(`/inquiry/confirmation?ref=${result.reference}`);
    } catch (err) {
      setError(err instanceof ApiError ? err : null);
      setState("error");
    }
  };

  const whatsappContext = {
    intent: "inquiry" as const,
    items: items.map((i) => `${i.title} · ${formatDateKey(i.date)} · ${paxLabel(i.pax)}`),
    pax,
    date: flexible ? "Flexible" : formatDateKey(date),
    priceLabel: items.length ? priceIn(total, currency) : undefined,
    placement: "inquiry_form",
  };

  return (
    <form id="inquiry-form" onSubmit={submit} className={cn("space-y-4", className)} noValidate>
      {/* Honeypot — invisible to humans, filled by bots (pivot §9 #1). */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input tabIndex={-1} autoComplete="off" onChange={(e) => (honeypot.current = e.target.value)} />
        </label>
      </div>

      {/* ---- Required: two fields ------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="iq-name" className="mb-1 block text-sm font-bold text-ink-900">
            Your name <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id="iq-name"
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "iq-name-err" : undefined}
            className={cn(
              "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900",
              errors.name ? "border-[var(--color-danger)]" : "border-ink-200",
            )}
          />
          {errors.name && (
            <p id="iq-name-err" className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="iq-phone" className="mb-1 block text-sm font-bold text-ink-900">
            WhatsApp number <span className="text-[var(--color-danger)]">*</span>
          </label>
          <div className="flex gap-2">
            <select
              aria-label="Country code"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="min-h-12 rounded-[var(--radius-control)] border border-ink-200 bg-paper px-2 text-sm font-semibold"
            >
              <option value="+91">+91</option>
              <option value="+971">+971</option>
            </select>
            <input
              id="iq-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "iq-phone-err" : "iq-phone-hint"}
              className={cn(
                "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900",
                errors.phone ? "border-[var(--color-danger)]" : "border-ink-200",
              )}
            />
          </div>
          {errors.phone ? (
            <p id="iq-phone-err" className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
              {errors.phone}
            </p>
          ) : (
            <p id="iq-phone-hint" className="mt-1 text-xs text-ink-500">
              We message once about this trip. No marketing unless you ask.
            </p>
          )}
        </div>
      </div>

      {/* ---- Dates + guests — pre-filled, editable, flexible allowed --------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          {flexible ? (
            <button
              type="button"
              onClick={() => setFlexible(false)}
              className="flex min-h-13 w-full items-center gap-3 rounded-[var(--radius-control)] border border-dashed border-ink-300 bg-paper px-3.5 text-left hover:border-ink-500"
            >
              <CalendarDays className="h-5 w-5 shrink-0 text-sun-500" aria-hidden="true" />
              <span>
                <span className="block text-2xs font-bold uppercase tracking-wide text-ink-400">When</span>
                <span className="block text-sm font-bold text-ink-900">Dates flexible · tap to set</span>
              </span>
            </button>
          ) : (
            <DateField value={date} onClick={() => setDateOpen(true)} label="When" />
          )}
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-ink-600">
            <input
              type="checkbox"
              checked={flexible}
              onChange={(e) => setFlexible(e.target.checked)}
              className="h-4 w-4 rounded accent-ink-900"
            />
            Not sure yet — my dates are flexible
          </label>
        </div>
        <GuestField value={pax} onClick={() => setGuestOpen(true)} />
      </div>

      {/* ---- Dietary — the wedge, one tap ---------------------------------- */}
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold text-ink-900">Food requirement</legend>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={dietary === d.id}
              onClick={() => setDietary(dietary === d.id ? undefined : d.id)}
              className={cn(
                "min-h-11 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                dietary === d.id
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-300 bg-paper text-ink-700 hover:border-ink-900",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* ---- Optional details, collapsed — one screen on 360×640 ---------- */}
      <div className="rounded-[var(--radius-control)] border border-ink-200">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-controls="iq-more"
          className="flex min-h-12 w-full items-center justify-between px-4 text-left text-sm font-bold text-ink-800"
        >
          Add details (optional)
          <ChevronDown className={cn("h-4.5 w-4.5 transition-transform", moreOpen && "rotate-180")} />
        </button>
        <div id="iq-more" hidden={!moreOpen} className="space-y-4 border-t border-ink-200 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="iq-email" className="mb-1 block text-sm font-bold text-ink-900">
                Email
              </label>
              <input
                id="iq-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
              />
              <p className="mt-1 text-xs text-ink-500">Only as a backup if WhatsApp fails.</p>
            </div>
            <div>
              <label htmlFor="iq-hotel" className="mb-1 block text-sm font-bold text-ink-900">
                Hotel or area
              </label>
              <input
                id="iq-hotel"
                value={hotel}
                onChange={(e) => setHotel(e.target.value)}
                placeholder="Not booked yet is fine"
                className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
              />
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-bold text-ink-900">Rough budget for activities</legend>
            <div className="flex flex-wrap gap-2">
              {BUDGET_BANDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={budget === b.id}
                  onClick={() => setBudget(budget === b.id ? undefined : b.id)}
                  className={cn(
                    "min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors",
                    budget === b.id
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-300 bg-paper text-ink-700 hover:border-ink-900",
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="iq-notes" className="mb-1 block text-sm font-bold text-ink-900">
              Anything we should know?
            </label>
            <textarea
              id="iq-notes"
              rows={3}
              maxLength={NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Parents who can't do dune bashing · an anniversary · wheelchair user · Hindi-speaking guide"
              className="w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper p-3 text-[0.95rem] outline-none focus:border-ink-900"
            />
            <p className="mt-1 text-right text-xs tnum text-ink-500">
              {notes.length} / {NOTES_MAX}
            </p>
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4.5 w-4.5 rounded accent-ink-900"
        />
        <span>
          Reply to me on WhatsApp about this trip.{" "}
          <span className="text-ink-500">Untick and we&apos;ll use email instead — slower.</span>
        </span>
      </label>

      {state === "error" && (
        <Alert tone="danger" title="That didn't send">
          {error?.recovery ??
            "Something failed at our end. Nothing you typed is lost — try again, or send it on WhatsApp instead."}
        </Alert>
      )}

      {/* ---- Both rails, equal weight (pivot §4.2). On mobile the submit is a
              sticky bar so the CTA is always one thumb away (§4.2 "sticky submit"). */}
      <div className="space-y-2">
        <div className="hidden sm:block">
          <Button type="submit" block size="lg" loading={state === "sending"} loadingLabel="Sending…">
            <Send className="h-[1.15rem] w-[1.15rem]" />
            Send inquiry — we reply in ~{SLA.responseMinutes} min
          </Button>
        </div>
        <WhatsAppButton block size="lg" context={whatsappContext} />
        <ResponsePromise className="justify-center pt-1" prefix="Free to ask" />
        <ConfirmFirstNote className="justify-center text-center" />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-paper/97 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-sticky)] backdrop-blur sm:hidden">
        <Button
          type="submit"
          form="inquiry-form"
          block
          size="lg"
          loading={state === "sending"}
          loadingLabel="Sending…"
        >
          <Send className="h-[1.15rem] w-[1.15rem]" />
          Send inquiry — reply in ~{SLA.responseMinutes} min
        </Button>
      </div>

      <DatePickerSheet
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        value={date}
        onChange={(d) => {
          setDate(d);
          setFlexible(false);
        }}
      />
      <GuestSheet open={guestOpen} onClose={() => setGuestOpen(false)} value={pax} onChange={setPax} />
    </form>
  );
}

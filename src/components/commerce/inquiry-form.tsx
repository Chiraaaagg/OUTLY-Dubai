"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { siteConfig } from "@/lib/site-config";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Send } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { DateField, DatePickerSheet, GuestField, GuestSheet } from "./pickers";
import { WhatsAppButton } from "./whatsapp";
import { ConfirmFirstNote, ResponsePromise } from "./inquiry-ui";
import { ApiError, submitInquiry } from "@/lib/api";
import { InquiryVerify } from "./inquiry-verify";
import {
  CAPTCHA_ELEMENT_ID,
  CaptchaPendingError,
  startOtp,
  widgetConfigured,
  type OtpAttempt,
} from "@/lib/otp-flow";
import { useCustomerHint } from "@/lib/use-customer-hint";
import { serverErrorCode } from "@/lib/server-error";
import { track } from "@/lib/analytics";
import { BUDGET_BANDS, SLA } from "@/lib/inquiry";
import type { BudgetBand, CartItem, Dietary, PaxCount } from "@/lib/types";
import { cn, EMPTY_PAX, formatDateKey, paxLabel, paxTotal, priceIn, toDateKey } from "@/lib/utils";
import { normalisePhone } from "@/lib/phone";
import { transactionCurrency } from "@/lib/currency";

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
 * Reimplemented on OUTLYY tokens with CSS-only motion and 44px targets.
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

/**
 * A key for one filled-in form. Passed to `useState` as a lazy initialiser so
 * it is generated once rather than on every render — the value is only kept
 * from the first call, and re-deriving it would be both wasted work and an
 * impure expression in the render body.
 */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `iq-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

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
  // Unticked by default: WhatsApp messaging is a separate, affirmative
  // choice, not something bundled into sending the form. A pre-ticked box is
  // not consent under the GDPR, the UAE PDPL or India's DPDP Act.
  const [consent, setConsent] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const honeypot = useRef("");
  const startedAt = useRef(Date.now());

  // Verification. A visitor who is already signed in never sees any of this;
  // for everyone else the code step opens in place, over the filled-in form.
  const { signedIn, refresh: refreshSession } = useCustomerHint();
  const [attempt, setAttempt] = useState<OtpAttempt | null>(null);
  /**
   * One key for the life of this form, not per submission.
   *
   * It has to survive the code step: the guest flow sends the same payload
   * twice, once before verifying (rejected) and once after. Regenerating it
   * would let a double tap on the second send create two inquiries, which is
   * precisely what it exists to prevent.
   */
  const [idempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    track("inquiry_started", {
      item_count: items.length,
      value: items.reduce((s, i) => s + i.total.inr, 0),
      inquiry_source: source,
    });
    // Nothing is preloaded here any more. The widget is only needed if the
    // server asks for verification, which it does not while
    // FEATURE_VERIFIED_INQUIRIES is off — and loading a third-party script on
    // every inquiry view for a step most visitors never reach is a cost with no
    // return. `beginVerification` loads it on demand if that changes.
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
    const parsed = normalisePhone(phone, countryCode);
    if (!phone.trim()) next.phone = "We reply on WhatsApp, this is the one thing we genuinely need.";
    else if (!parsed.valid) next.phone = parsed.reason ?? "That doesn't look like a valid WhatsApp number.";
    setErrors(next);
    Object.keys(next).forEach((field) =>
      track("inquiry_field_error", { field, failure_reason: next[field] }),
    );
    return Object.keys(next).length === 0;
  };

  /**
   * Send a code and open the verification step in place.
   *
   * The form stays mounted underneath, so nothing typed is lost and "change
   * number" is a step back rather than a restart.
   */
  const beginVerification = async () => {
    const parsed = normalisePhone(phone, countryCode);
    if (!parsed.valid) {
      setErrors({ phone: parsed.reason ?? "That doesn't look like a valid WhatsApp number." });
      setState("idle");
      return;
    }
    setState("sending");
    setError(null);
    try {
      const next = await startOtp({
        e164: parsed.e164,
        national: parsed.national,
        countryCode: parsed.countryCode,
      });
      track("otp_sent", { context: "inquiry", resend: false });
      setAttempt(next);
      setState("idle");
    } catch (err) {
      // Fixable in one click, so it belongs at the checkbox, not in the
      // page-level "something failed" alert.
      if (err instanceof CaptchaPendingError) {
        setErrors({ captcha: "Tick the box above to confirm you're not a robot, then send again." });
        setState("idle");
        return;
      }
      if (serverErrorCode(err) === "RATE_LIMITED") {
        setErrors({
          phone: "Too many codes requested for this number. Wait fifteen minutes, or send it on WhatsApp instead.",
        });
        setState("idle");
        return;
      }
      setError(err instanceof ApiError ? err : null);
      setState("error");
    }
  };

  /**
   * Create the inquiry. Only ever reached with a verified session behind it,
   * either because the visitor was already signed in or because the code step
   * just finished. The server enforces that independently.
   */
  const createInquiry = async () => {
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
        // The enquiry is recorded in a currency the back office quotes in; a
        // visitor browsing in USD has theirs written in AED.
        currency: transactionCurrency(currency),
        source,
        whatsappConsent: consent,
        honeypot: honeypot.current,
        startedAt: startedAt.current,
        idempotencyKey,
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
        "outlyy.lastInquiry",
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
      const apiErr = err instanceof ApiError ? err : null;
      // Field-level server errors land at the field (audit S10), not in the page alert.
      const fields = apiErr?.fields ?? {};
      const fieldErrors: Record<string, string> = {};
      if (fields.phone) fieldErrors.phone = fields.phone;
      if (fields.name) fieldErrors.name = fields.name;
      if (fields.email) fieldErrors.email = fields.email;
      if (Object.keys(fieldErrors).length) {
        setErrors(fieldErrors);
        Object.keys(fieldErrors).forEach((field) =>
          track("inquiry_field_error", { field, failure_reason: fieldErrors[field], source: "server" }),
        );
        setState("idle");
        document.getElementById(fieldErrors.phone ? "iq-phone" : fieldErrors.name ? "iq-name" : "iq-email")?.focus();
        return;
      }
      // The session lapsed between the hint cookie and this request landing.
      // That is recoverable in one step, so ask for a code instead of showing
      // a failure the visitor cannot act on.
      if (serverErrorCode(err) === "VERIFICATION_REQUIRED") {
        await beginVerification();
        return;
      }

      setError(apiErr);
      setState("error");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The code step owns the flow once it is open; its own button submits.
    if (attempt || state === "sending") return;
    if (!validate()) return;

    // Always try to send. The server decides whether verification is required
    // and answers VERIFICATION_REQUIRED if so, which `createInquiry` handles by
    // opening the code step. Branching on `signedIn` here would duplicate that
    // decision on the client, where it can disagree with the server — and did,
    // which is how guests ended up funnelled into a code flow that could not
    // complete.
    await createInquiry();
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
      {/* Honeypot, invisible to humans, filled by bots (pivot §9 #1). */}
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

      {/* ---- Dates + guests, pre-filled, editable, flexible allowed --------- */}
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
            Not sure yet, my dates are flexible
          </label>
        </div>
        <GuestField value={pax} onClick={() => setGuestOpen(true)} />
      </div>

      {/* ---- Dietary, the wedge, one tap ---------------------------------- */}
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

      {/* ---- Optional details, collapsed, one screen on 360×640 ---------- */}
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
          Message me on WhatsApp about this trip.{" "}
          <span className="text-ink-500">
            {siteConfig.legalName ?? siteConfig.name} will use your number to answer this enquiry
            and nothing else, no marketing. Reply STOP any time to stop. Leave it unticked and
            we&apos;ll reply by email instead, which is slower.
          </span>
        </span>
      </label>

      {/* Contract terms are accepted by sending, and said so before the button, not after. */}
      <p className="text-xs leading-relaxed text-ink-500">
        By sending this enquiry you agree to our{" "}
        <Link href="/terms" className="font-semibold underline underline-offset-2 hover:text-ink-700">
          Terms
        </Link>{" "}
        and confirm you have read the{" "}
        <Link href="/privacy" className="font-semibold underline underline-offset-2 hover:text-ink-700">
          Privacy Policy
        </Link>
        , which explains what we do with your name, number and trip details, and how to have them
        deleted.
      </p>

      {state === "error" && (
        <Alert tone="danger" title="That didn't send">
          {error?.recovery ??
            "Something failed at our end. Nothing you typed is lost, try again, or send it on WhatsApp instead."}
        </Alert>
      )}

      {/*
        hCaptcha's render target, and the reason it lives here rather than
        inside the verification panel: MSG91 will not send a code until the
        challenge is cleared, so it has to be on screen *before* the visitor
        presses send, not after. It is also mounted for the whole flow, because
        a resend can be challenged too and two elements with this id would be
        invalid and ambiguous to the widget.

        Hidden until hCaptcha actually draws an iframe — most visitors never see
        it, and an empty bordered box above the CTA would be a needless worry.
      */}
      {widgetConfigured() && !signedIn && (
        <div>
          <div id={CAPTCHA_ELEMENT_ID} className="[&:not(:has(iframe))]:hidden" />
          {errors.captcha && (
            <p className="mt-2 text-sm text-[var(--color-danger)]" role="alert">
              {errors.captcha}
            </p>
          )}
        </div>
      )}

      {/* ---- Verification, for visitors who are not signed in yet. Replaces the
              send buttons rather than sitting beside them, so there is exactly
              one thing to do next. */}
      {attempt && (
        <InquiryVerify
          attempt={attempt}
          onAttemptChange={setAttempt}
          sending={state === "sending"}
          onVerified={async () => {
            // The session cookies exist now; keep the header in step with them.
            refreshSession();
            await createInquiry();
          }}
          onCancel={() => {
            setAttempt(null);
            setState("idle");
            document.getElementById("iq-phone")?.focus();
          }}
        />
      )}

      {/* ---- Both rails, equal weight (pivot §4.2). On mobile the submit is a
              sticky bar so the CTA is always one thumb away (§4.2 "sticky submit"). */}
      {!attempt && (
        <div className="space-y-2">
          <div className="hidden sm:block">
            <Button type="submit" block size="lg" loading={state === "sending"} loadingLabel="Sending…">
              <Send className="h-[1.15rem] w-[1.15rem]" />
              Send inquiry, we reply in ~{SLA.responseMinutes} min
            </Button>
          </div>
          <WhatsAppButton block size="lg" context={whatsappContext} />
          <ResponsePromise className="justify-center pt-1" prefix="Free to ask" />
          <ConfirmFirstNote className="justify-center text-center" />
        </div>
      )}

      {/* Hidden during verification: the code step carries its own button, and a
          second sticky CTA underneath would be the wrong thing to tap. */}
      {!attempt && (
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
            Send inquiry, reply in ~{SLA.responseMinutes} min
          </Button>
        </div>
      )}

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

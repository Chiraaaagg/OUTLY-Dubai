"use client";

import { useState } from "react";
import { Building2, Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { Button } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card } from "@/components/ui/primitives";
import { track } from "@/lib/analytics";
import { requestQuote } from "@/lib/api";
import { RESPONSE_SLA, SUPPORT_HOURS } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

const TOPICS = [
  "A booking I've made",
  "Before I book",
  "Payment or refund",
  "GST invoice",
  "Group or corporate booking",
  "Partnership or supplier enquiry",
];

/**
 * CONTACT
 *
 * The form exists for the small number of enquiries that genuinely need a
 * paper trail — invoices, corporate bookings, supplier enquiries. Everything
 * else is faster on WhatsApp, and the page says so rather than pretending a
 * form is the best channel.
 */
export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", topic: TOPICS[0], message: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "We need a name to reply to.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (!form.message.trim()) next.message = "Tell us what you need — even a line is enough.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setState("sending");
    try {
      await requestQuote({
        name: form.name,
        phone: form.phone,
        notes: `${form.topic}: ${form.message}`,
      });
      track("support_contacted", { page_type: "contact_form", filters: form.topic });
      setState("sent");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="container-page py-6 pb-20">
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Contact" }]} className="mb-3" />
        <h1 className="text-[1.75rem] sm:text-3xl">Contact us</h1>
        <p className="mt-1.5 text-[0.95rem] text-ink-600">
          For anything about an existing booking, WhatsApp is genuinely faster — {RESPONSE_SLA.toLowerCase()}.
          The form below is for invoices, group bookings and supplier enquiries.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <Card className="p-5">
            <h2 className="text-xl">Send us a message</h2>
            {state === "sent" ? (
              <Alert tone="success" className="mt-4" title="Message received">
                We&apos;ll reply to {form.email} within one working day — usually much sooner. If
                it&apos;s urgent or about a booking in the next 48 hours, message us on WhatsApp
                instead and we&apos;ll pick it up straight away.
                <div className="mt-3">
                  <WhatsAppButton
                    size="sm"
                    context={{ intent: "general", placement: "contact_success" }}
                  />
                </div>
              </Alert>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Your name"
                    id="name"
                    value={form.name}
                    onChange={(v) => setForm({ ...form, name: v })}
                    error={errors.name}
                    required
                  />
                  <Field
                    label="Email"
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(v) => setForm({ ...form, email: v })}
                    error={errors.email}
                    required
                  />
                </div>
                <Field
                  label="Phone (optional)"
                  id="phone"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  hint="Only if you'd rather we called."
                />
                <div>
                  <label htmlFor="topic" className="mb-1 block text-sm font-bold text-ink-900">
                    What&apos;s it about?
                  </label>
                  <select
                    id="topic"
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
                  >
                    {TOPICS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="message" className="mb-1 block text-sm font-bold text-ink-900">
                    Message <span className="text-[var(--color-danger)]">*</span>
                  </label>
                  <textarea
                    id="message"
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    aria-invalid={Boolean(errors.message)}
                    className={cn(
                      "w-full rounded-[var(--radius-control)] border bg-paper p-3 text-[0.95rem] outline-none focus:border-ink-900",
                      errors.message ? "border-[var(--color-danger)]" : "border-ink-200",
                    )}
                  />
                  {errors.message && (
                    <p className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
                      {errors.message}
                    </p>
                  )}
                </div>

                {state === "error" && (
                  <Alert tone="danger" title="That didn't send">
                    Something failed at our end, not yours. Try again, or message us on WhatsApp —
                    nothing you typed has been lost.
                  </Alert>
                )}

                <Button type="submit" size="lg" loading={state === "sending"}>
                  Send message
                </Button>
              </form>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5 text-whatsapp" aria-hidden="true" />
                Faster: WhatsApp
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                {RESPONSE_SLA} during {SUPPORT_HOURS}. Out of hours you get an acknowledgement within
                a minute with an expected reply time.
              </p>
              <div className="mt-3">
                <WhatsAppButton block context={{ intent: "general", placement: "contact" }} />
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-lg">Other ways</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li className="flex gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
                  <span>
                    <strong className="block font-bold text-ink-900">24/7 emergency</strong>
                    <a href="tel:+97140000000" className="text-ink-600 underline">
                      +971 4 000 0000
                    </a>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
                  <span>
                    <strong className="block font-bold text-ink-900">Email</strong>
                    <a href="mailto:help@outly.in" className="text-ink-600 underline">
                      help@outly.in
                    </a>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
                  <span>
                    <strong className="block font-bold text-ink-900">Hours</strong>
                    <span className="text-ink-600">{SUPPORT_HOURS}</span>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
                  <span>
                    <strong className="block font-bold text-ink-900">Offices</strong>
                    <span className="text-ink-600">
                      Mumbai, India · Business Bay, Dubai, UAE
                    </span>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
                  <span>
                    <strong className="block font-bold text-ink-900">Registered entity</strong>
                    <span className="text-ink-600">
                      OUTLY Travel Technologies Pvt. Ltd. · GSTIN 07AABCO1234A1Z5
                    </span>
                  </span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  error,
  hint,
  type = "text",
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
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
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        className={cn(
          "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900",
          error ? "border-[var(--color-danger)]" : "border-ink-200",
        )}
      />
      {error ? (
        <p className="mt-1 text-xs font-semibold text-[var(--color-danger)]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

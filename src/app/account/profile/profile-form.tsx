"use client";

import { useState, useTransition } from "react";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/primitives";
import type { Currency, Dietary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { requestDeletionAction, updatePreferencesAction, updateProfileAction, type ActionResult } from "../_actions";

/**
 * Profile form — three cards: details, communication preferences, your data.
 *
 * Preferences are per-channel switches honoured immediately (consent rows,
 * source "profile"); an opt-out that takes a business day is not an opt-out.
 * Export is a plain link to `GET /api/me/export` (the browser handles the
 * download). Deletion is a two-step confirm that logs a request for ops —
 * we say plainly that it is a request, and that seven years of invoices
 * stay for tax reasons.
 *
 * Dietary chips reuse the inquiry form's pattern (21st.dev
 * @cnippet-dev/v-textarea-10: chips instead of selects).
 */

const DIETARY_OPTIONS: { id: Dietary; label: string }[] = [
  { id: "veg", label: "Pure veg" },
  { id: "jain", label: "Jain" },
  { id: "halal", label: "Halal" },
  { id: "non-veg", label: "No restriction" },
];

const INPUT =
  "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] text-ink-900 outline-none focus:border-ink-900 disabled:opacity-60";

export interface ProfileFormCustomer {
  fullName: string;
  email: string;
  phoneMasked: string;
  dietary?: Dietary;
  hotel: string;
  preferredCurrency: Currency;
}

export interface ProfileFormPreferences {
  whatsappTransactional: boolean;
  whatsappMarketing: boolean;
  email: boolean;
}

export function ProfileForm({
  customer,
  preferences,
}: {
  customer: ProfileFormCustomer;
  preferences: ProfileFormPreferences;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DetailsCard customer={customer} />
      <PreferencesCard initial={preferences} />
      <DataCard />
    </div>
  );
}

/* ------------------------------------------------------------------ details */

function DetailsCard({ customer }: { customer: ProfileFormCustomer }) {
  const { toast, setCurrency } = useApp();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    fullName: customer.fullName,
    email: customer.email,
    dietary: customer.dietary,
    hotel: customer.hotel,
    preferredCurrency: customer.preferredCurrency,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const dirty =
    form.fullName !== customer.fullName ||
    form.email !== customer.email ||
    form.dietary !== customer.dietary ||
    form.hotel !== customer.hotel ||
    form.preferredCurrency !== customer.preferredCurrency;

  const save = () => {
    setMessage(null);
    setErrors({});
    start(async () => {
      const result: ActionResult = await updateProfileAction(form);
      if (result.ok) {
        setCurrency(form.preferredCurrency);
        toast({ tone: "success", title: "Details saved" });
      } else {
        setErrors(result.fields ?? {});
        setMessage(result.message);
      }
    });
  };

  return (
    <Card className="p-5" as="section">
      <h2 className="text-xl">Your details</h2>
      <p className="mt-1 text-sm text-ink-600">
        Pre-filled on your next inquiry so you only type the dates. Everything here is optional.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="mt-4 space-y-4"
        noValidate
      >
        <div>
          <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">WhatsApp number</p>
          <p className="text-[0.95rem] font-semibold tnum text-ink-900">{customer.phoneMasked}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            This is how you sign in and where we reply. To change it, message us on WhatsApp from the new number.
          </p>
        </div>

        <Field id="pf-name" label="Full name" error={errors.fullName}>
          <input
            id="pf-name"
            value={form.fullName}
            autoComplete="name"
            maxLength={120}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            aria-invalid={Boolean(errors.fullName)}
            className={cn(INPUT, errors.fullName ? "border-[var(--color-danger)]" : "border-ink-200")}
          />
        </Field>

        <Field id="pf-email" label="Email" hint="Optional. For confirmations and invoices if you'd rather not have them on WhatsApp." error={errors.email}>
          <input
            id="pf-email"
            type="email"
            value={form.email}
            autoComplete="email"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
            className={cn(INPUT, errors.email ? "border-[var(--color-danger)]" : "border-ink-200")}
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-ink-900">Food requirement</legend>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={form.dietary === d.id}
                onClick={() => setForm({ ...form, dietary: form.dietary === d.id ? undefined : d.id })}
                className={cn(
                  "min-h-11 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                  form.dietary === d.id
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-300 bg-paper text-ink-700 hover:border-ink-900",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-500">
            Applied to every inquiry; it changes which operator we quote.
          </p>
        </fieldset>

        <Field id="pf-hotel" label="Hotel or area" hint="Decides pickup coverage. Fine to leave blank until you've booked a hotel." error={errors.hotel}>
          <input
            id="pf-hotel"
            value={form.hotel}
            maxLength={200}
            onChange={(e) => setForm({ ...form, hotel: e.target.value })}
            aria-invalid={Boolean(errors.hotel)}
            className={cn(INPUT, errors.hotel ? "border-[var(--color-danger)]" : "border-ink-200")}
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-ink-900">Show prices in</legend>
          <div className="inline-flex rounded-full border border-ink-200 bg-paper p-0.5" role="group">
            {(["INR", "AED"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={form.preferredCurrency === c}
                onClick={() => setForm({ ...form, preferredCurrency: c })}
                className={cn(
                  "min-h-10 rounded-full px-4 text-sm font-bold transition-colors",
                  form.preferredCurrency === c ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100",
                )}
              >
                {c === "INR" ? "₹ INR" : "AED"}
              </button>
            ))}
          </div>
        </fieldset>

        {message && (
          <Alert tone="danger" title="Not saved">
            {message}
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" size="md" loading={pending} loadingLabel="Saving…" disabled={!dirty}>
            Save details
          </Button>
          {!dirty && !pending && <span className="text-sm text-ink-500">Up to date</span>}
        </div>
      </form>
    </Card>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-ink-900">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-semibold text-[var(--color-danger)]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- preferences */

const PREF_ROWS: { key: keyof ProfileFormPreferences; label: string; hint: string }[] = [
  {
    key: "whatsappTransactional",
    label: "WhatsApp — about your trips",
    hint: "Replies to your inquiries, payment links, vouchers and day-of updates. Turning this off means we can only reach you by email.",
  },
  {
    key: "whatsappMarketing",
    label: "WhatsApp — offers and ideas",
    hint: "Seasonal inventory and price drops on things you've saved. At most one message a week; one tap turns it off.",
  },
  {
    key: "email",
    label: "Email",
    hint: "Confirmations, invoices and receipts.",
  },
];

function PreferencesCard({ initial }: { initial: ProfileFormPreferences }) {
  const { toast } = useApp();
  const [pending, start] = useTransition();
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);

  const dirty = PREF_ROWS.some((r) => prefs[r.key] !== saved[r.key]);

  const save = () => {
    setMessage(null);
    start(async () => {
      const result = await updatePreferencesAction(prefs);
      if (result.ok) {
        setSaved(prefs);
        toast({ tone: "success", title: "Preferences saved", body: "Applied immediately." });
      } else {
        setMessage(result.message);
      }
    });
  };

  return (
    <Card className="p-5" as="section">
      <h2 className="text-xl">Communication preferences</h2>
      <p className="mt-1 text-sm text-ink-600">Changes take effect immediately across every message we send.</p>
      <div className="mt-4 space-y-1">
        {PREF_ROWS.map((row) => (
          <label
            key={row.key}
            className="flex min-h-11 cursor-pointer items-start justify-between gap-4 border-b border-ink-200 py-3 last:border-0"
          >
            <span className="min-w-0">
              <span className="block text-[0.95rem] font-bold text-ink-900">{row.label}</span>
              <span className="block text-xs leading-snug text-ink-600">{row.hint}</span>
            </span>
            <span
              className={cn(
                "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors",
                prefs[row.key] ? "bg-[var(--color-success)]" : "bg-ink-300",
              )}
            >
              <input
                type="checkbox"
                role="switch"
                aria-checked={prefs[row.key]}
                checked={prefs[row.key]}
                disabled={pending}
                onChange={() => setPrefs((p) => ({ ...p, [row.key]: !p[row.key] }))}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                  prefs[row.key] ? "translate-x-[1.4rem]" : "translate-x-0.5",
                )}
              />
            </span>
          </label>
        ))}
      </div>

      {message && (
        <Alert tone="danger" title="Not saved" className="mt-4">
          {message}
        </Alert>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button size="md" onClick={save} loading={pending} loadingLabel="Saving…" disabled={!dirty}>
          Save preferences
        </Button>
        {!dirty && !pending && <span className="text-sm text-ink-500">Up to date</span>}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- your data */

function DataCard() {
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    setMessage(null);
    start(async () => {
      const result = await requestDeletionAction({ reason: reason.trim() || undefined });
      if (result.ok) setStep("done");
      else setMessage(result.fields?.reason ?? result.message);
    });
  };

  return (
    <Card className="p-5 lg:col-span-2" as="section">
      <h2 className="flex items-center gap-2 text-xl">
        <ShieldCheck className="h-5 w-5 text-sun-500" aria-hidden="true" />
        Your data
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-600">
        Export everything we hold about you, or ask us to delete it. A person actions deletion
        requests within a few working days. Invoices and paid bookings from the last seven years are
        kept for tax and legal reasons even after deletion — we can&apos;t remove those, and we&apos;d
        rather say so than pretend otherwise.
      </p>

      {step === "done" ? (
        <Alert tone="success" title="Deletion request logged" className="mt-4">
          We&apos;ve recorded it and someone from the team will confirm on WhatsApp once it&apos;s done.
          Nothing has been removed yet, so you can still sign in until then.
        </Alert>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/api/me/export"
            download="outlyy-my-data.json"
            className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 text-sm font-semibold text-ink-900 hover:border-ink-500 hover:bg-shell"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export my data
          </a>
          {step === "idle" && (
            <Button variant="danger" size="sm" onClick={() => setStep("confirm")}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Request deletion
            </Button>
          )}
        </div>
      )}

      {step === "confirm" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-4 rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-danger)_30%,white)] bg-[var(--color-danger-bg)]/40 p-4"
        >
          <p className="text-sm font-bold text-ink-900">Delete this account and its inquiry history?</p>
          <p className="mt-1 text-sm text-ink-700">
            Open inquiries will be closed. If you just want fewer messages, the preferences above are
            the better tool.
          </p>
          <label htmlFor="del-reason" className="mt-3 block text-sm font-bold text-ink-900">
            Anything we should know? <span className="font-normal text-ink-500">(optional)</span>
          </label>
          <textarea
            id="del-reason"
            value={reason}
            maxLength={500}
            rows={2}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 py-2 text-[0.95rem] text-ink-900 outline-none focus:border-ink-900"
          />
          {message && (
            <Alert tone="danger" className="mt-3">
              {message}
            </Alert>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" variant="danger" size="md" loading={pending} loadingLabel="Sending…">
              Yes, request deletion
            </Button>
            <Button type="button" variant="outline" size="md" onClick={() => setStep("idle")} disabled={pending}>
              Keep my account
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

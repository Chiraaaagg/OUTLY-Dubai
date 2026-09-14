"use client";

import { useState } from "react";
import { CreditCard, Download, ShieldCheck, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { CurrencyToggle } from "@/components/commerce/price";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/primitives";
import { demoUser } from "@/lib/data/bookings";
import { cn } from "@/lib/utils";

/**
 * PROFILE, PREFERENCES & PAYMENT SETTINGS
 *
 * Includes the communication preferences the WhatsApp flows read from, and the
 * data export/delete controls the DPDP Act requires (AC-ACC-03). Consent is a
 * per-channel switch, honoured immediately — an opt-out that takes a business
 * day is not an opt-out.
 */
export default function ProfilePage() {
  const { toast } = useApp();
  const [prefs, setPrefs] = useState(demoUser.preferences);
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof typeof prefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="text-xl">Your details</h2>
        <p className="mt-1 text-sm text-ink-600">
          These pre-fill at checkout so a repeat booking takes about 30 seconds.
        </p>
        <div className="mt-4 space-y-4">
          <ReadonlyField label="Full name" value={demoUser.name} />
          <ReadonlyField label="Email" value={demoUser.email} />
          <ReadonlyField label="Phone (WhatsApp)" value={demoUser.phone} />
          <ReadonlyField
            label="Dietary requirement"
            value="Jain — no onion, no garlic"
            hint="Applied automatically to every booking, and printed on your voucher."
          />
        </div>
        <Button variant="outline" size="sm" className="mt-4">
          Edit details
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="text-xl">Communication preferences</h2>
        <p className="mt-1 text-sm text-ink-600">
          Changes take effect immediately across every message flow.
        </p>
        <div className="mt-4 space-y-1">
          {[
            {
              key: "whatsapp" as const,
              label: "WhatsApp",
              hint: "Vouchers, driver details, day-of updates. Turning this off means vouchers arrive by email only.",
            },
            { key: "email" as const, label: "Email", hint: "Confirmations, GST invoices and receipts." },
            {
              key: "priceDrops" as const,
              label: "Price drops & low availability",
              hint: "Only for activities you've saved. At most one message a week.",
            },
          ].map((row) => (
            <label
              key={row.key}
              className="flex cursor-pointer items-start justify-between gap-4 border-b border-ink-200 py-3 last:border-0"
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
                  checked={prefs[row.key]}
                  onChange={() => toggle(row.key)}
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
        <div className="mt-4 flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => {
              setSaved(true);
              toast({ tone: "success", title: "Preferences saved", body: "Applied immediately." });
            }}
          >
            Save preferences
          </Button>
          {saved && (
            <span className="text-sm font-semibold text-[var(--color-success)]">Saved</span>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-xl">
          <CreditCard className="h-5 w-5 text-sun-500" aria-hidden="true" />
          Payment preferences
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          Saved methods are tokenised by the gateway. We never see or store a card number.
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-ink-200 p-3">
            <div>
              <p className="text-sm font-bold text-ink-900">UPI · rajesh@okhdfcbank</p>
              <p className="text-xs text-ink-500">Default method</p>
            </div>
            <Button variant="ghost" size="sm">
              Remove
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-ink-200 p-3">
            <div>
              <p className="text-sm font-bold text-ink-900">HDFC card •••• 4412</p>
              <p className="text-xs text-ink-500">Expires 09/28 · EMI eligible</p>
            </div>
            <Button variant="ghost" size="sm">
              Remove
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-bold text-ink-900">Display currency</p>
          <CurrencyToggle />
          <p className="mt-1.5 text-xs text-ink-500">
            Living in the UAE? Switch to AED and your UAE card works normally at checkout.
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-xl">
          <ShieldCheck className="h-5 w-5 text-sun-500" aria-hidden="true" />
          Your data
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          You can export everything we hold about you, or ask us to delete it. Bookings and invoices
          from the last seven years are kept for tax and legal reasons even after deletion — we
          can&apos;t remove those, and we&apos;d rather say so than pretend otherwise.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Export my data
          </Button>
          <Button variant="danger" size="sm">
            <Trash2 className="h-4 w-4" />
            Request deletion
          </Button>
        </div>
        <Alert tone="info" className="mt-4">
          This build has no authentication — profile data is mock and nothing is persisted beyond
          your browser.
        </Alert>
      </Card>
    </div>
  );
}

function ReadonlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="text-[0.95rem] font-semibold text-ink-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { CustomerInquiryCard } from "@/components/commerce/inquiry-ui";
import { WhatsAppCard } from "@/components/commerce/whatsapp";
import { Button } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card, Skeleton } from "@/components/ui/primitives";
import { track } from "@/lib/analytics";
import { ApiError, lookupInquiry, type InquiryLookupResult } from "@/lib/api";
import { normalisePhone } from "@/lib/phone";
import { isValidReference, normaliseReference } from "@/lib/reference";
import { serverErrorCode } from "@/lib/server-error";
import { cn } from "@/lib/utils";

/**
 * GUEST INQUIRY TRACKER (customer-auth contract §4)
 *
 * Reference + the WhatsApp number used. No sign-in. Both must match; the
 * API answers 404 for any mismatch and this page never says which half was
 * wrong (§17 §9 #4). The reference is Luhn-checked client-side first so a
 * typo doesn't spend one of the five lookups per fifteen minutes.
 *
 * Lookup form follows 21st.dev "Order Tracking" (@javierdev0/order-tracking):
 * reference + identifier → status, reimplemented on OUTLYY tokens. The result
 * reuses the adapted "Order History" track (@kavikatiyar/order-history) via
 * `CustomerInquiryCard`, so the status reads exactly as it does in /account.
 */
export default function TrackInquiryPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-8">
          <Skeleton className="mx-auto h-80 max-w-2xl rounded-[var(--radius-tile)]" />
        </div>
      }
    >
      <TrackInner />
    </Suspense>
  );
}

const INPUT =
  "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] text-ink-900 outline-none focus:border-ink-900 disabled:opacity-60";

function TrackInner() {
  const params = useSearchParams();
  const [reference, setReference] = useState(() => normaliseReference(params.get("ref") ?? ""));
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ reference?: string; phone?: string }>({});
  const [failure, setFailure] = useState<{ title: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InquiryLookupResult | null>(null);

  useEffect(() => {
    track("page_view", { page_type: "inquiry_track" });
  }, []);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = normaliseReference(reference);
    const parsed = normalisePhone(phone, countryCode);
    const next: typeof errors = {};
    if (!ref) next.reference = "Enter the reference from your WhatsApp or email acknowledgement.";
    else if (!isValidReference(ref, "INQ")) {
      next.reference = "That reference doesn't look right. It starts with INQ- followed by digits, for example INQ-104821.";
    }
    if (!phone.trim()) next.phone = "Enter the WhatsApp number you gave us.";
    else if (!parsed.valid) next.phone = parsed.reason ?? "That doesn't look like a valid mobile number.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    setFailure(null);
    setResult(null);
    try {
      const view = await lookupInquiry(ref, parsed.national, parsed.countryCode);
      setResult(view);
      track("support_contacted", { page_type: "inquiry_track", inquiry_reference: ref });
    } catch (err) {
      const code = serverErrorCode(err);
      if (code === "NOT_FOUND") {
        setFailure({
          title: "We couldn't find that inquiry with that number",
          body: "Check the reference in your acknowledgement and use the exact WhatsApp number you gave us. If it still doesn't match, message us on WhatsApp and we'll find it.",
        });
      } else if (code === "RATE_LIMITED") {
        setFailure({
          title: "Too many lookups from this connection",
          body: "Wait fifteen minutes and try again, or message us on WhatsApp with your reference — that's usually quicker.",
        });
      } else if (code === "VALIDATION_FAILED" && err instanceof ApiError && err.fields) {
        setErrors({ reference: err.fields.reference, phone: err.fields.phone });
      } else if (err instanceof ApiError) {
        setFailure({ title: "That didn't work", body: err.recovery });
      } else {
        setFailure({ title: "That didn't work", body: "Try again in a moment, or message us on WhatsApp with your reference." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page py-6 pb-20">
      <div className="mx-auto max-w-2xl">
        <Breadcrumbs
          items={[{ label: "Dubai", href: "/" }, { label: "Track your inquiry" }]}
          className="mb-3"
        />
        <h1 className="text-[1.75rem] sm:text-3xl">Track your inquiry</h1>
        <p className="mt-1.5 text-[0.95rem] text-ink-600">
          No sign-in needed. Your reference is in the WhatsApp message we sent when you asked — it
          looks like INQ-104821.
        </p>

        {result ? (
          <section className="mt-6" aria-live="polite">
            <CustomerInquiryCard inquiry={result} placement="inquiry_track" detailed />
            <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-ink-600">
                <Link href="/login?next=%2Faccount%2Finquiries" className="font-bold text-sun-700 underline underline-offset-2">
                  Sign in
                </Link>{" "}
                to see every inquiry made with this number in one place.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setPhone("");
                }}
              >
                Check another inquiry
              </Button>
            </div>
          </section>
        ) : (
          <Card className="mt-6 p-5">
            <form onSubmit={lookup} className="space-y-4" noValidate>
              <div>
                <label htmlFor="track-ref" className="mb-1 block text-sm font-bold text-ink-900">
                  Inquiry reference
                </label>
                <input
                  id="track-ref"
                  value={reference}
                  onChange={(e) => {
                    setReference(e.target.value.toUpperCase());
                    if (errors.reference) setErrors({ ...errors, reference: undefined });
                  }}
                  placeholder="INQ-104821"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.reference)}
                  aria-describedby={errors.reference ? "track-ref-err" : undefined}
                  className={cn(INPUT, "uppercase tnum", errors.reference ? "border-[var(--color-danger)]" : "border-ink-200")}
                />
                {errors.reference && (
                  <p id="track-ref-err" className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
                    {errors.reference}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="track-phone" className="mb-1 block text-sm font-bold text-ink-900">
                  WhatsApp number you gave us
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
                    id="track-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors({ ...errors, phone: undefined });
                    }}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? "track-phone-err" : "track-phone-hint"}
                    className={cn(INPUT, errors.phone ? "border-[var(--color-danger)]" : "border-ink-200")}
                  />
                </div>
                {errors.phone ? (
                  <p id="track-phone-err" className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
                    {errors.phone}
                  </p>
                ) : (
                  <p id="track-phone-hint" className="mt-1 text-xs text-ink-500">
                    Used only to confirm the inquiry is yours. Nothing is stored from this page.
                  </p>
                )}
              </div>

              {failure && (
                <Alert tone="danger" title={failure.title}>
                  {failure.body}
                </Alert>
              )}

              <Button type="submit" block size="lg" loading={loading} loadingLabel="Looking it up…">
                <Search className="h-[1.15rem] w-[1.15rem]" />
                Show my inquiry
              </Button>
            </form>
          </Card>
        )}

        <WhatsAppCard
          className="mt-6"
          context={{ intent: "inquiry_followup", placement: "inquiry_track" }}
          title="Lost the reference?"
          body="Message us from the number you used and we'll find it — no reference needed."
        />

        {!result && (
          <p className="mt-6 text-sm text-ink-600">
            Made more than one inquiry?{" "}
            <Link href="/login?next=%2Faccount%2Finquiries" className="font-bold text-sun-700 underline underline-offset-2">
              Sign in with your number
            </Link>{" "}
            to see them all. Looking for a paid booking instead?{" "}
            <Link href="/manage-booking" className="font-bold text-sun-700 underline underline-offset-2">
              Find it by reference
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

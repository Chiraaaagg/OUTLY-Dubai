"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { WhatsAppCard } from "@/components/commerce/whatsapp";
import { Button } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card } from "@/components/ui/primitives";
import { ApiError, fetchBooking } from "@/lib/api";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * GUEST BOOKING LOOKUP
 *
 * Reference + the phone or email used at booking. No password, no account.
 * Every failure state here names the likely cause and offers a route out —
 * a customer standing outside a venue with a booking they can't find is the
 * worst moment in the product to show "Not found".
 */
export default function ManageBookingPage() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) {
      setError("Enter the booking reference from your confirmation — it looks like OUT-123456.");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    track("support_contacted", { page_type: "manage_booking", booking_reference: reference });
    try {
      const booking = await fetchBooking(reference.trim());
      router.push(`/booking/${booking.reference}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.recovery
          : "We couldn't reach the booking system. Try again in a moment, or message us on WhatsApp with your reference.",
      );
      setState("error");
    }
  };

  return (
    <div className="container-page py-6 pb-20">
      <div className="mx-auto max-w-2xl">
        <Breadcrumbs
          items={[{ label: "Dubai", href: "/" }, { label: "Find my booking" }]}
          className="mb-3"
        />
        <h1 className="text-[1.75rem] sm:text-3xl">Find your booking</h1>
        <p className="mt-1.5 text-[0.95rem] text-ink-600">
          No account needed. Your reference is in the WhatsApp message and email we sent when you
          booked — it looks like OUT-123456.
        </p>

        <Card className="mt-6 p-5">
          <form onSubmit={lookup} className="space-y-4">
            <div>
              <label htmlFor="ref" className="mb-1 block text-sm font-bold text-ink-900">
                Booking reference
              </label>
              <input
                id="ref"
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                placeholder="OUT-123456"
                autoComplete="off"
                aria-invalid={state === "error"}
                aria-describedby={state === "error" ? "lookup-error" : undefined}
                className={cn(
                  "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] uppercase outline-none focus:border-ink-900",
                  state === "error" ? "border-[var(--color-danger)]" : "border-ink-200",
                )}
              />
            </div>
            <div>
              <label htmlFor="contact" className="mb-1 block text-sm font-bold text-ink-900">
                Email or phone used to book
              </label>
              <input
                id="contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email or WhatsApp number you booked with"
                autoComplete="email"
                className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900"
              />
              <p className="mt-1 text-xs text-ink-500">
                Used only to confirm the booking is yours. We don&apos;t create an account from it.
              </p>
            </div>

            {state === "error" && error && (
              <Alert tone="danger" title="We couldn't find that booking" id="lookup-error">
                {error}
              </Alert>
            )}

            <Button type="submit" block size="lg" loading={state === "loading"}>
              <Search className="h-[1.15rem] w-[1.15rem]" />
              Find my booking
            </Button>
          </form>
        </Card>

        <WhatsAppCard
          className="mt-6"
          context={{ intent: "booking_support", placement: "manage_booking" }}
          title="Lost your reference?"
          body="Message us the phone number or email you booked with and we'll find it in under a minute — no reference needed."
        />

        <p className="mt-6 text-sm text-ink-600">
          Have an account?{" "}
          <Link href="/login" className="font-bold text-sun-700 underline underline-offset-2">
            Log in
          </Link>{" "}
          to see all your trips in one place.
        </p>
      </div>
    </div>
  );
}

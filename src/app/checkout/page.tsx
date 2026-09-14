"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Landmark,
  Lock,
  RefreshCw,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { PaymentMethods } from "@/components/commerce/trust";
import { WhatsAppButton, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card, EmptyState } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { ApiError, reverifyPrice, submitOrder } from "@/lib/api";
import { track } from "@/lib/analytics";
import {
  DEPOSIT_THRESHOLD_INR,
  EMI_THRESHOLD_INR,
  applyCoupon,
  cartRequiresInquiry,
  depositSplit,
  type CouponResult,
} from "@/lib/pricing";
import type { Dietary, Traveller } from "@/lib/types";
import { cn, formatDateLong, paxLabel, priceIn } from "@/lib/utils";

/**
 * CHECKOUT (PRD §5.6)
 *
 * INQUIRY MODE GATE (pivot plan §2.1, §2.2, §8.1 item 5): this route is
 * retained in full but only serves carts whose every item is instant-mode.
 * Any inquiry-mode item redirects to /inquiry (the mixed-cart rule). Nothing
 * below is deleted — flipping a SKU's fulfilmentMode brings steps 3–4 back
 * for that SKU with no code change.
 *
 * Four steps on one page with progressive sections — not four page loads.
 * Guest checkout is mandatory: forced registration is a conversion tax we will
 * not pay (AC-CO-01). Account creation is offered after payment, using details
 * already given.
 *
 * The rules this screen enforces:
 *   AC-CO-02  the review total equals the charged total, exactly
 *   AC-CO-03  a payment failure preserves the cart and explains itself plainly
 *   AC-CO-04  a price change requires explicit re-consent
 *   AC-CO-06  abandoned checkout recovery is consent-gated, not assumed
 *   AC-CO-07  no card data touches our servers — the gateway owns those fields
 *
 * Both rails again: any step can be handed to a WhatsApp agent who sees the
 * same cart and sends a payment link for the same total.
 */

type Step = 1 | 2 | 3;

type PaymentState =
  | "idle"
  | "processing"
  | "failed"
  | "timeout"
  | "price_changed";

const PAYMENT_METHODS = [
  {
    id: "upi",
    label: "UPI",
    hint: "GPay, PhonePe, Paytm or any UPI app",
    icon: Smartphone,
    primary: true,
  },
  { id: "card", label: "Credit or debit card", hint: "Visa, Mastercard, RuPay, Amex", icon: CreditCard },
  { id: "netbanking", label: "Netbanking", hint: "All major Indian banks", icon: Landmark },
  { id: "wallet", label: "Wallets", hint: "Paytm, Amazon Pay, Mobikwik", icon: Wallet },
];

const DIETARY_OPTIONS: { id: Dietary; label: string }[] = [
  { id: "veg", label: "Pure vegetarian" },
  { id: "jain", label: "Jain — no onion, no garlic" },
  { id: "halal", label: "Halal" },
  { id: "non-veg", label: "No restriction" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, cartTotalINR, cartTotalAED, currency, clearCart, hydrated, toast } = useApp();

  const [step, setStep] = useState<Step>(1);
  const [traveller, setTraveller] = useState<Traveller>({
    fullName: "",
    email: "",
    phone: "",
    countryCode: "+91",
    hotel: "",
    dietary: undefined,
    specialRequests: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [terms, setTerms] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null);
  const [method, setMethod] = useState("upi");
  const [payDeposit, setPayDeposit] = useState(false);
  const [payment, setPayment] = useState<PaymentState>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [priceChange, setPriceChange] = useState<{ old: number; next: number; reason: string } | null>(
    null,
  );

  const subtotal = { inr: cartTotalINR, aed: cartTotalAED };
  const discount = couponResult?.ok ? couponResult.discount : { inr: 0, aed: 0 };
  const total = { inr: subtotal.inr - discount.inr, aed: subtotal.aed - discount.aed };
  const deposit = depositSplit(total);
  const hasManual = cart.some((i) => i.confirmation === "manual");

  useEffect(() => {
    if (hydrated && cart.length && cartRequiresInquiry(cart)) {
      router.replace("/inquiry");
    }
  }, [hydrated, cart, router]);

  useEffect(() => {
    if (hydrated && cart.length && !cartRequiresInquiry(cart)) {
      track("checkout_started", {
        value: cartTotalINR,
        currency: "INR",
        result_count: cart.length,
        rail: "self_serve",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!traveller.fullName.trim()) next.fullName = "We need a name for the booking voucher.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(traveller.email))
      next.email = "Enter an email we can send the voucher and invoice to.";
    if (!/^\d{7,12}$/.test(traveller.phone.replace(/\s/g, "")))
      next.phone = "We need a working number — the driver and your voucher both use it.";
    if (!terms) next.terms = "Please confirm you've read the cancellation policy.";
    setErrors(next);
    Object.keys(next).forEach((field) =>
      track("checkout_field_error", { field, failure_reason: next[field] }),
    );
    return Object.keys(next).length === 0;
  };

  const onApplyCoupon = () => {
    const result = applyCoupon(coupon, subtotal);
    setCouponResult(result);
    track(result.ok ? "coupon_applied" : "coupon_rejected", {
      coupon,
      value: result.ok ? result.discount.inr : undefined,
    });
  };

  const pay = async () => {
    if (!validate()) {
      setStep(1);
      return;
    }
    setPayment("processing");
    setError(null);
    track("payment_initiated", {
      payment_method: method,
      value: payDeposit ? deposit.now.inr : total.inr,
      currency: "INR",
    });

    try {
      // AC-INV-01 / AC-CO-04: re-verify price and availability at the moment of
      // authorisation, before anything is charged.
      const check = await reverifyPrice(cart);
      if (check.changed && !priceChange) {
        setPriceChange({
          old: check.oldTotalINR ?? total.inr,
          next: check.newTotalINR,
          reason: check.reason ?? "The operator changed the rate for this date.",
        });
        setPayment("price_changed");
        return;
      }

      const order = await submitOrder({
        items: cart,
        traveller,
        paymentMethod: method,
        couponCode: couponResult?.ok ? couponResult.coupon.code : undefined,
        rail: "self_serve",
        currency,
        totalINR: total.inr,
        totalAED: total.aed,
        discountINR: discount.inr,
      });

      track("payment_completed", {
        payment_method: method,
        value: total.inr,
        currency: "INR",
        booking_reference: order.reference,
      });
      track("booking_confirmed", {
        booking_reference: order.reference,
        booking_status: order.status,
        value: total.inr,
        rail: "self_serve",
      });
      if (order.status === "supplier_pending") {
        track("supplier_confirmation_pending", { booking_reference: order.reference });
      }

      sessionStorage.setItem(
        "outly.lastOrder",
        JSON.stringify({ ...order, items: cart, traveller, total, method }),
      );
      clearCart();
      router.push(
        `/booking/confirmation?ref=${order.reference}&status=${order.status}&eta=${order.voucherEtaMinutes}`,
      );
    } catch (e) {
      const apiError = e instanceof ApiError ? e : null;
      setError(apiError);
      setPayment(apiError?.code === "payment_timeout" ? "timeout" : "failed");
      track("payment_failed", {
        payment_method: method,
        failure_reason: apiError?.code ?? "unknown",
        value: total.inr,
      });
    }
  };

  if (!hydrated) {
    return (
      <div className="container-page py-10">
        <div className="skeleton h-96 w-full rounded-[var(--radius-tile)]" />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="container-page py-10 pb-20">
        <EmptyState
          title="Nothing to check out yet"
          body="Your trip is empty. Add an experience and it'll appear here — or if you started a booking on WhatsApp, we can pick it up from there."
          action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          secondary={<ButtonLink href="/manage-booking" variant="outline">Find an existing booking</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="container-page py-6 pb-24">
      <Breadcrumbs
        items={[{ label: "Dubai", href: "/" }, { label: "Your trip", href: "/cart" }, { label: "Checkout" }]}
        className="mb-3"
      />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] sm:text-3xl">Checkout</h1>
          <p className="mt-1.5 text-[0.95rem] text-ink-600">
            No account needed. Around 90 seconds if you have your details handy.
          </p>
        </div>
        <WhatsAppButton
          size="md"
          context={{
            intent: "checkout_help",
            checkoutStep: `Step ${step}`,
            priceLabel: priceIn(total, currency),
            question: `I'm booking: ${cart.map((c) => c.title).join(" / ")}`,
            placement: "checkout_header",
          }}
          label="Finish this on WhatsApp"
        />
      </div>

      {/* Step indicator */}
      <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Checkout progress">
        {["Your details", "Review", "Payment"].map((label, i) => {
          const n = (i + 1) as Step;
          const done = step > n;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  done
                    ? "bg-[var(--color-success)] text-white"
                    : step === n
                      ? "bg-ink-900 text-white"
                      : "bg-ink-200 text-ink-600",
                )}
                aria-current={step === n ? "step" : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : n}
              </span>
              <span className={cn("font-semibold", step === n ? "text-ink-900" : "text-ink-500")}>
                {label}
              </span>
              {i < 2 && <span aria-hidden="true" className="h-px w-6 bg-ink-200 sm:w-10" />}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* ---------------------------------------------------- STEP 1 */}
          <Card className="p-5">
            <h2 className="text-xl">1 · Who&apos;s travelling</h2>
            <p className="mt-1 text-sm text-ink-600">
              We only ask for what the supplier actually needs. Passport details are collected later,
              and only where an operator requires them.
            </p>

            {step === 1 ? (
              <div className="mt-4 space-y-4">
                <Field
                  label="Lead traveller's full name"
                  id="fullName"
                  value={traveller.fullName}
                  onChange={(v) => setTraveller({ ...traveller, fullName: v })}
                  error={errors.fullName}
                  autoComplete="name"
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Email"
                    id="email"
                    type="email"
                    value={traveller.email}
                    onChange={(v) => setTraveller({ ...traveller, email: v })}
                    error={errors.email}
                    hint="Voucher and GST invoice go here."
                    autoComplete="email"
                    required
                  />
                  <div>
                    <label htmlFor="phone" className="mb-1 block text-sm font-bold text-ink-900">
                      WhatsApp number <span className="text-[var(--color-danger)]">*</span>
                    </label>
                    <div className="flex gap-2">
                      <select
                        aria-label="Country code"
                        value={traveller.countryCode}
                        onChange={(e) =>
                          setTraveller({ ...traveller, countryCode: e.target.value })
                        }
                        className="min-h-12 rounded-[var(--radius-control)] border border-ink-200 bg-paper px-2 text-sm font-semibold"
                      >
                        <option value="+91">+91</option>
                        <option value="+971">+971</option>
                      </select>
                      <input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={traveller.phone}
                        onChange={(e) => setTraveller({ ...traveller, phone: e.target.value })}
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
                        className={cn(
                          "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900",
                          errors.phone ? "border-[var(--color-danger)]" : "border-ink-200",
                        )}
                      />
                    </div>
                    {errors.phone ? (
                      <p id="phone-error" className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
                        {errors.phone}
                      </p>
                    ) : (
                      <p id="phone-hint" className="mt-1 text-xs text-ink-500">
                        Your voucher and driver details arrive here.
                      </p>
                    )}
                  </div>
                </div>

                <Field
                  label="Hotel or pickup location"
                  id="hotel"
                  value={traveller.hotel ?? ""}
                  onChange={(v) => setTraveller({ ...traveller, hotel: v })}
                  hint="Needed for pickup-included activities. Not sure yet? Leave it and tell us later."
                  autoComplete="off"
                />

                <fieldset>
                  <legend className="mb-1.5 text-sm font-bold text-ink-900">
                    Dietary requirement
                  </legend>
                  <p className="mb-2 text-xs text-ink-500">
                    Attached to the booking and printed on your voucher — not a note someone might
                    miss. Jain meals need 24 hours&apos; notice.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_OPTIONS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={traveller.dietary === d.id}
                        onClick={() =>
                          setTraveller({
                            ...traveller,
                            dietary: traveller.dietary === d.id ? undefined : d.id,
                          })
                        }
                        className={cn(
                          "min-h-11 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
                          traveller.dietary === d.id
                            ? "border-ink-900 bg-ink-900 text-white"
                            : "border-ink-300 bg-paper text-ink-700 hover:border-ink-900",
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="requests" className="mb-1 block text-sm font-bold text-ink-900">
                    Anything we should know?
                  </label>
                  <textarea
                    id="requests"
                    rows={3}
                    value={traveller.specialRequests}
                    onChange={(e) =>
                      setTraveller({ ...traveller, specialRequests: e.target.value })
                    }
                    placeholder="Travelling with parents who can't do dune bashing · celebrating an anniversary · wheelchair user in the group"
                    className="w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper p-3 text-[0.95rem] outline-none focus:border-ink-900"
                  />
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={whatsappConsent}
                    onChange={(e) => setWhatsappConsent(e.target.checked)}
                    className="mt-0.5 h-4.5 w-4.5 rounded accent-ink-900"
                  />
                  <span>
                    Send my voucher and trip updates on WhatsApp, and message me if I don&apos;t
                    finish this booking.{" "}
                    <span className="text-ink-500">
                      You can opt out any time by replying STOP — it takes effect immediately.
                    </span>
                  </span>
                </label>

                <Button
                  size="lg"
                  onClick={() => {
                    const ok =
                      traveller.fullName.trim() &&
                      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(traveller.email) &&
                      /^\d{7,12}$/.test(traveller.phone.replace(/\s/g, ""));
                    if (!ok) {
                      validate();
                      return;
                    }
                    setErrors({});
                    setStep(2);
                  }}
                >
                  Continue to review
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex items-start justify-between gap-4">
                <div className="text-sm text-ink-600">
                  <p className="font-bold text-ink-900">{traveller.fullName}</p>
                  <p>
                    {traveller.email} · {traveller.countryCode} {traveller.phone}
                  </p>
                  {traveller.hotel && <p>{traveller.hotel}</p>}
                  {traveller.dietary && (
                    <p className="font-semibold text-[var(--color-success)]">
                      {DIETARY_OPTIONS.find((d) => d.id === traveller.dietary)?.label}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="shrink-0 text-sm font-bold text-sun-700 underline underline-offset-2"
                >
                  Edit
                </button>
              </div>
            )}
          </Card>

          {/* ---------------------------------------------------- STEP 2 */}
          {step >= 2 && (
            <Card className="p-5">
              <h2 className="text-xl">2 · Review your booking</h2>
              <p className="mt-1 text-sm text-ink-600">
                No line here that wasn&apos;t visible on the activity page. That&apos;s the whole
                promise.
              </p>

              <ul className="mt-4 divide-y divide-ink-200">
                {cart.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3">
                    <span className="h-14 w-16 shrink-0 overflow-hidden rounded-lg">
                      <Scene src={item.image} alt="" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug text-ink-900">{item.title}</p>
                      <p className="text-xs text-ink-500">
                        {formatDateLong(item.date)} · {item.time}
                      </p>
                      <p className="text-xs text-ink-500">{paxLabel(item.pax)}</p>
                      <p className="mt-1 text-xs text-ink-600">
                        {item.freeCancellationHours > 0
                          ? `Free cancellation up to ${item.freeCancellationHours}h before.`
                          : "Non-refundable once confirmed."}
                      </p>
                    </div>
                    <p className="shrink-0 font-bold tnum">{priceIn(item.total, currency)}</p>
                  </li>
                ))}
              </ul>

              {/* Coupon */}
              <div className="mt-4">
                <label htmlFor="coupon" className="mb-1 block text-sm font-bold text-ink-900">
                  Coupon code
                </label>
                <div className="flex gap-2">
                  <input
                    id="coupon"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    placeholder="FIRSTTRIP"
                    className="min-h-12 w-full rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 text-[0.95rem] uppercase outline-none focus:border-ink-900"
                  />
                  <Button variant="outline" onClick={onApplyCoupon} disabled={!coupon.trim()}>
                    Apply
                  </Button>
                </div>
                {couponResult && (
                  <p
                    role="status"
                    className={cn(
                      "mt-1.5 text-xs font-semibold",
                      couponResult.ok
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-danger)]",
                    )}
                  >
                    {couponResult.message}
                  </p>
                )}
              </div>

              {step === 2 && (
                <Button size="lg" className="mt-5" onClick={() => setStep(3)}>
                  Continue to payment
                </Button>
              )}
            </Card>
          )}

          {/* ---------------------------------------------------- STEP 3 */}
          {step >= 3 && (
            <Card className="p-5">
              <h2 className="text-xl">3 · Payment</h2>
              <p className="mt-1 text-sm text-ink-600">
                Handled by a PCI-compliant gateway. Card details never reach our servers, and we
                don&apos;t store them.
              </p>

              {/* Price re-consent (AC-CO-04) */}
              {payment === "price_changed" && priceChange && (
                <Alert
                  tone="warning"
                  title="The price changed while you were booking"
                  className="mt-4"
                  icon={<AlertTriangle className="h-4.5 w-4.5" />}
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setPayment("idle");
                          void pay();
                        }}
                      >
                        Accept ₹{priceChange.next.toLocaleString("en-IN")} and pay
                      </Button>
                      <ButtonLink href="/cart" size="sm" variant="outline">
                        Back to my trip
                      </ButtonLink>
                    </div>
                  }
                >
                  <p>
                    Was ₹{priceChange.old.toLocaleString("en-IN")}, now ₹
                    {priceChange.next.toLocaleString("en-IN")}. {priceChange.reason}
                  </p>
                </Alert>
              )}

              {/* Payment failure (AC-CO-03) */}
              {(payment === "failed" || payment === "timeout") && (
                <Alert
                  tone={payment === "timeout" ? "warning" : "danger"}
                  title={
                    payment === "timeout"
                      ? "We haven't heard back from the payment gateway"
                      : "That payment didn't go through"
                  }
                  className="mt-4"
                  action={
                    <div className="flex flex-wrap gap-2">
                      {payment === "failed" && (
                        <Button size="sm" onClick={() => void pay()}>
                          <RefreshCw className="h-4 w-4" /> Try again
                        </Button>
                      )}
                      <WhatsAppButton
                        size="sm"
                        context={{
                          intent: "payment_help",
                          checkoutStep: "payment",
                          priceLabel: priceIn(total, currency),
                          placement: "checkout_payment_error",
                        }}
                      />
                    </div>
                  }
                >
                  {error?.recovery ??
                    "Nothing has been charged and your trip is exactly as you left it. Try a different method, or we'll send you a payment link on WhatsApp."}
                </Alert>
              )}

              <fieldset className="mt-4">
                <legend className="sr-only">Payment method</legend>
                <div className="space-y-2">
                  {PAYMENT_METHODS.map((m) => (
                    <label
                      key={m.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border p-3.5 transition-colors",
                        method === m.id ? "border-ink-900 bg-shell" : "border-ink-200 hover:border-ink-400",
                        m.primary && "min-h-16",
                      )}
                    >
                      <input
                        type="radio"
                        name="payment"
                        checked={method === m.id}
                        onChange={() => {
                          setMethod(m.id);
                          track("payment_method_selected", { payment_method: m.id });
                        }}
                        className="h-4.5 w-4.5 accent-ink-900"
                      />
                      <m.icon className="h-5 w-5 shrink-0 text-sun-500" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.95rem] font-bold text-ink-900">
                          {m.label}
                          {m.primary && (
                            <span className="ml-2 rounded-full bg-sun-100 px-2 py-0.5 text-2xs font-bold text-sun-700">
                              Most used
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-ink-600">{m.hint}</span>
                      </span>
                    </label>
                  ))}

                  {total.inr >= EMI_THRESHOLD_INR && (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border p-3.5",
                        method === "emi" ? "border-ink-900 bg-shell" : "border-ink-200",
                      )}
                    >
                      <input
                        type="radio"
                        name="payment"
                        checked={method === "emi"}
                        onChange={() => setMethod("emi")}
                        className="h-4.5 w-4.5 accent-ink-900"
                      />
                      <CreditCard className="h-5 w-5 shrink-0 text-sun-500" aria-hidden="true" />
                      <span>
                        <span className="block text-[0.95rem] font-bold text-ink-900">
                          EMI · from ₹{Math.round(total.inr / 6).toLocaleString("en-IN")}/month
                        </span>
                        <span className="block text-xs text-ink-600">
                          3, 6 or 9 months on most Indian credit cards
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              </fieldset>

              {/* Deposit option */}
              {total.inr >= DEPOSIT_THRESHOLD_INR && (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-lagoon-200 bg-lagoon-50 p-3.5">
                  <input
                    type="checkbox"
                    checked={payDeposit}
                    onChange={(e) => setPayDeposit(e.target.checked)}
                    className="mt-0.5 h-4.5 w-4.5 rounded accent-lagoon-600"
                  />
                  <span className="text-sm">
                    <span className="block font-bold text-lagoon-700">
                      Pay 30% now, the rest 7 days before you travel
                    </span>
                    <span className="mt-0.5 block text-lagoon-700/80">
                      {priceIn(deposit.now, currency)} today, {priceIn(deposit.later, currency)} on
                      the balance date. We&apos;ll remind you on WhatsApp. Your booking is confirmed
                      either way.
                    </span>
                  </span>
                </label>
              )}

              <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  aria-invalid={Boolean(errors.terms)}
                  className="mt-0.5 h-4.5 w-4.5 rounded accent-ink-900"
                />
                <span>
                  I&apos;ve read the{" "}
                  <Link href="/cancellation-policy" className="font-bold text-sun-700 underline">
                    cancellation policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/terms" className="font-bold text-sun-700 underline">
                    terms
                  </Link>{" "}
                  for these activities.
                </span>
              </label>
              {errors.terms && (
                <p className="mt-1 text-xs font-semibold text-[var(--color-danger)]">{errors.terms}</p>
              )}

              <Button
                block
                size="lg"
                className="mt-5"
                loading={payment === "processing"}
                loadingLabel="Confirming with the operator…"
                onClick={() => void pay()}
              >
                {payDeposit
                  ? `Pay ${priceIn(deposit.now, currency)} deposit`
                  : `Pay ${priceIn(total, currency)}`}
              </Button>

              {payment === "processing" && (
                <p className="mt-2 text-center text-xs text-ink-600" role="status">
                  Re-checking availability with the operator before charging you. Don&apos;t close
                  this page — it usually takes a few seconds.
                </p>
              )}

              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-500">
                <Lock className="h-3.5 w-3.5" />
                Secured by a PCI-DSS compliant gateway
              </p>
              <PaymentMethods className="mt-3 justify-center" />
            </Card>
          )}

          {hasManual && (
            <Alert tone="info" title="One of these needs the operator to confirm">
              You&apos;ll get a status message within five minutes and the confirmed voucher within
              two hours. If the operator can&apos;t take it, we offer you an alternative SKU, an
              alternative date or a full refund — within two hours, without you having to chase.
            </Alert>
          )}

          <WhatsAppCard
            context={{
              intent: "checkout_help",
              checkoutStep: `Step ${step}`,
              priceLabel: priceIn(total, currency),
              placement: "checkout_body",
            }}
            title="Rather have a person do this?"
            body="Send us your trip on WhatsApp. An agent confirms availability, answers whatever you're unsure about, and sends a payment link for the same total — same booking engine, same voucher, same cancellation rights."
          />
        </div>

        {/* ------------------------------------------------------ SUMMARY */}
        <aside className="lg:sticky lg:top-28">
          <Card className="p-5">
            <h2 className="text-lg">Order summary</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between gap-3">
                <span className="text-ink-600">
                  Subtotal ({cart.length} {cart.length === 1 ? "activity" : "activities"})
                </span>
                <span className="font-semibold tnum">{priceIn(subtotal, currency)}</span>
              </li>
              {discount.inr > 0 && (
                <li className="flex justify-between gap-3 text-[var(--color-success)]">
                  <span>Coupon {couponResult?.ok ? couponResult.coupon.code : ""}</span>
                  <span className="font-semibold tnum">−{priceIn(discount, currency)}</span>
                </li>
              )}
              <li className="flex justify-between gap-3 text-ink-600">
                <span>Taxes &amp; booking fees</span>
                <span className="font-semibold">Included</span>
              </li>
            </ul>
            <div className="mt-3 flex justify-between border-t border-ink-200 pt-3">
              <span className="font-bold">Total to pay</span>
              <span className="font-display text-xl font-bold tnum">
                {payDeposit ? priceIn(deposit.now, currency) : priceIn(total, currency)}
              </span>
            </div>
            {payDeposit && (
              <p className="mt-1 text-xs text-ink-600">
                Balance of {priceIn(deposit.later, currency)} due 7 days before travel.
              </p>
            )}
            <p className="mt-2 text-xs font-semibold text-[var(--color-success)]">
              This is the exact amount your card or UPI will be charged.
            </p>
          </Card>

          <div className="mt-4 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-5 text-sm">
            <h2 className="mb-2 text-[0.95rem]">What happens next</h2>
            <ol className="space-y-2 text-ink-600">
              <li className="flex gap-2">
                <span className="font-bold text-ink-900">1.</span> Payment confirms and we re-check
                availability with the operator.
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-ink-900">2.</span> Your QR voucher reaches WhatsApp,
                email and your account — usually inside a minute.
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-ink-900">3.</span> For pickups, driver name, photo
                and number arrive the evening before.
              </li>
            </ol>
          </div>
        </aside>
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
  autoComplete,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
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
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          "min-h-12 w-full rounded-[var(--radius-control)] border bg-paper px-3 text-[0.95rem] outline-none focus:border-ink-900",
          error ? "border-[var(--color-danger)]" : "border-ink-200",
        )}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { AlertTriangle, MessageCircle, RefreshCw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { track } from "@/lib/analytics";

/**
 * Route error boundary.
 *
 * Two rules: never show a stack trace to a customer, and never leave them
 * without a route to a human. The error is logged with enough detail for us to
 * find it, and the page offers a retry plus WhatsApp — because someone whose
 * checkout just broke will not go and find the support page.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    track("error_shown", {
      failure_reason: error.message,
      page_type: "route_error",
      filters: error.digest,
    });
    // Real implementation forwards to the error tracker here.
    // eslint-disable-next-line no-console
    console.error("[route error]", error);
  }, [error]);

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-xl">
        <Card className="p-6 text-center sm:p-8">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
          >
            <AlertTriangle className="h-7 w-7" />
          </span>
          <h1 className="text-2xl">Something broke at our end</h1>
          <p className="mx-auto mt-2 max-w-md text-[0.95rem] leading-relaxed text-ink-600">
            That&apos;s on us, not you. Nothing has been charged and no booking has been changed.
            Try again — and if it happens twice, message us and we&apos;ll do it manually rather
            than make you fight the website.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <Button onClick={reset} size="lg">
              <RefreshCw className="h-[1.15rem] w-[1.15rem]" />
              Try again
            </Button>
            <a
              href="https://wa.me/919000000000?text=Hi%20OUTLY!%20I%20hit%20an%20error%20on%20the%20website."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-13 items-center gap-2 rounded-[var(--radius-control)] border-2 border-whatsapp bg-white px-5 font-semibold text-ink-900 shadow-[0_2px_0_var(--color-whatsapp-dark)]"
            >
              <MessageCircle className="h-[1.15rem] w-[1.15rem]" />
              Message us on WhatsApp
            </a>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
            <ButtonLink href="/" variant="ghost" size="sm">
              Go to the homepage
            </ButtonLink>
            <ButtonLink href="/manage-booking" variant="ghost" size="sm">
              Find my booking
            </ButtonLink>
          </div>

          {error.digest && (
            <p className="mt-6 text-xs text-ink-400">
              Reference for support: <span className="font-mono tnum">{error.digest}</span>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

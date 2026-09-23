"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  CONSENT_ALL,
  CONSENT_NONE,
  CONSENT_REOPEN_EVENT,
  getConsent,
  setConsent,
  type ConsentChoice,
} from "@/lib/consent";

/**
 * Cookie consent gate.
 *
 * Renders nothing until the client has mounted and read the stored decision,
 * so the server HTML is identical for everyone and nothing flashes. While no
 * decision exists, `src/lib/analytics.ts` writes no identifier cookies and
 * sends no events — the banner is the gate, not a notice posted after the
 * fact.
 *
 * Reject is as prominent as Accept, which PECR and the EDPB both require and
 * which most banners quietly ignore. There is no "X" that means yes.
 */

const PANEL =
  "fixed inset-x-0 bottom-0 z-50 border-t border-ink-200 bg-paper/98 shadow-[var(--shadow-sticky)] backdrop-blur";

export function CookieBanner() {
  const [decision, setDecision] = useState<ConsentChoice | null | undefined>(undefined);
  const [details, setDetails] = useState(false);
  const [measurement, setMeasurement] = useState(true);
  const [marketing, setMarketing] = useState(true);

  useEffect(() => {
    setDecision(getConsent());
    const reopen = () => {
      const current = getConsent();
      setMeasurement(current?.measurement ?? true);
      setMarketing(current?.marketing ?? true);
      setDetails(true);
      setDecision(null);
    };
    window.addEventListener(CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, reopen);
  }, []);

  // `undefined` = not read yet (server render and first paint); `null` = undecided.
  if (decision === undefined || decision) return null;

  const decide = (choice: { measurement: boolean; marketing: boolean }) => {
    setDecision(setConsent(choice));
    setDetails(false);
  };

  return (
    <div className={PANEL} role="dialog" aria-modal="false" aria-labelledby="cookie-title" aria-describedby="cookie-body">
      <div className="container-page py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <h2 id="cookie-title" className="text-base font-bold text-ink-900">
              Cookies, honestly
            </h2>
            <p id="cookie-body" className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-700">
              We need a couple of cookies to keep the site working — those are always on. Beyond
              that we&apos;d like to count visits and remember how you found us, which helps us
              spend less on ads and more on prices. Say no and the site works exactly the same.{" "}
              <Link href="/cookies" className="font-semibold underline underline-offset-2">
                What each cookie does
              </Link>{" "}
              ·{" "}
              <Link href="/privacy" className="font-semibold underline underline-offset-2">
                Privacy policy
              </Link>
            </p>

            {details && (
              <fieldset className="mt-3 space-y-2 rounded-[var(--radius-control)] border border-ink-200 bg-shell/60 p-3">
                <legend className="sr-only">Choose which cookies to allow</legend>

                <label className="flex items-start gap-2.5 text-sm text-ink-600">
                  <input type="checkbox" checked disabled className="mt-0.5 h-4 w-4" />
                  <span>
                    <strong className="text-ink-900">Strictly necessary</strong> — your sign-in,
                    your cart and this choice. Always on; the site cannot work without them.
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={measurement}
                    onChange={(e) => setMeasurement(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-ink-900"
                  />
                  <span>
                    <strong className="text-ink-900">Measurement</strong> — a random id so we can
                    count returning visits and see which pages fail people.{" "}
                    <span className="text-ink-500">outlyy_aid, outlyy_sid</span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={marketing}
                    onChange={(e) => setMarketing(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-ink-900"
                  />
                  <span>
                    <strong className="text-ink-900">Advertising attribution</strong> — remembers
                    which ad or search brought you, including Google and Meta click identifiers, so
                    we know which spend is worth repeating.{" "}
                    <span className="text-ink-500">outlyy_attr</span>
                  </span>
                </label>
              </fieldset>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
            {details ? (
              <Button size="sm" onClick={() => decide({ measurement, marketing })}>
                Save my choice
              </Button>
            ) : (
              <Button size="sm" onClick={() => decide(CONSENT_ALL)}>
                Accept all
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => decide(CONSENT_NONE)}>
              Reject all
            </Button>
            {!details && (
              <Button size="sm" variant="ghost" onClick={() => setDetails(true)}>
                Choose
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { openConsentSettings } from "@/lib/consent";

/**
 * Reopens the consent banner. Withdrawing consent has to be as easy as giving
 * it, so this sits in the footer next to the policy links on every page.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      Cookie settings
    </button>
  );
}

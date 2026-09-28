"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Signed-in hint (customer-auth contract §1).
 *
 * The backend sets a non-httpOnly `outlyy_customer=1` cookie beside the real
 * session cookie. It carries no data and grants nothing — every request still
 * re-resolves the httpOnly token against the database. It exists so the UI can
 * choose between two renderings without an API round trip on first paint.
 *
 * Read after mount, so the server render and the first client render agree and
 * nothing flashes. `refresh()` is for the case where the session changed inside
 * the current page — signing in mid-inquiry, for instance — and no navigation
 * happened to re-run the effect.
 *
 * Treat the result as a hint, never as authorisation. A visitor can set this
 * cookie by hand; all it buys them is a UI that optimistically shows an
 * account link, and the next request corrects it.
 */
export function useCustomerHint(dep?: string | null): { signedIn: boolean; refresh: () => void } {
  const [signedIn, setSignedIn] = useState(false);

  const refresh = useCallback(() => {
    try {
      setSignedIn(/(?:^|;\s*)outlyy_customer=1(?:;|$)/.test(document.cookie));
    } catch {
      setSignedIn(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, dep]);

  return { signedIn, refresh };
}

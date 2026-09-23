/**
 * Cookie consent — the gate in front of every non-essential cookie.
 *
 * Until a visitor makes a choice, `outlyy_aid`, `outlyy_sid` and `outlyy_attr`
 * are not written and no analytics event is sent. That is what PECR and the
 * GDPR require for measurement and advertising cookies, and it is the
 * behaviour UAE PDPL and India's DPDP notice-and-consent rules expect too.
 * Before this existed, all three were set on the first paint of the first
 * page, which is the thing a cookie banner is supposed to prevent.
 *
 * The choice itself lives in a first-party cookie. Recording a consent
 * decision is a strictly necessary purpose, so that one cookie needs no
 * consent of its own.
 *
 * Categories:
 *   necessary    always on — session, security, cart, and this record
 *   measurement  our own first-party analytics ids (outlyy_aid, outlyy_sid)
 *   marketing    attribution incl. ad click ids (outlyy_attr: gclid, fbclid)
 *                and any advertising pixel added later
 *
 * Bump `CONSENT_VERSION` whenever the categories or the cookies inside them
 * change: an old record stops counting and the banner asks again.
 */

export const CONSENT_COOKIE = "outlyy_consent";
export const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 6 months, then ask again
export const CONSENT_CHANGED_EVENT = "outlyy:consent";

export type ConsentCategory = "measurement" | "marketing";

export interface ConsentChoice {
  v: number;
  measurement: boolean;
  marketing: boolean;
  /** ISO timestamp of the decision — evidence that consent was given, and when. */
  at: string;
}

export const CONSENT_ALL: Omit<ConsentChoice, "v" | "at"> = { measurement: true, marketing: true };
export const CONSENT_NONE: Omit<ConsentChoice, "v" | "at"> = { measurement: false, marketing: false };

function read(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    const prefix = `${name}=`;
    for (const part of document.cookie.split(";")) {
      const p = part.trim();
      if (p.startsWith(prefix)) return decodeURIComponent(p.slice(prefix.length));
    }
  } catch {
    /* cookies disabled */
  }
  return undefined;
}

/** The stored decision, or `null` when the visitor has not chosen yet. */
export function getConsent(): ConsentChoice | null {
  const raw = read(CONSENT_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentChoice>;
    if (parsed.v !== CONSENT_VERSION) return null;
    return {
      v: CONSENT_VERSION,
      measurement: parsed.measurement === true,
      marketing: parsed.marketing === true,
      at: typeof parsed.at === "string" ? parsed.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** True only for an explicit grant — an undecided visitor is a "no". */
export function hasConsent(category: ConsentCategory): boolean {
  const c = getConsent();
  return c ? c[category] : false;
}

export function setConsent(choice: Omit<ConsentChoice, "v" | "at">): ConsentChoice {
  const record: ConsentChoice = { v: CONSENT_VERSION, ...choice, at: new Date().toISOString() };
  if (typeof document !== "undefined") {
    try {
      const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(record))}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    } catch {
      /* cookies disabled — the banner will simply ask again */
    }
    // Withdrawal has to take effect immediately, not on the next page load.
    if (!record.measurement || !record.marketing) clearRejected(record);
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: record }));
  }
  return record;
}

/**
 * Delete the cookies a category covers, for a visitor who has just said no.
 *
 * Google Analytics' `_ga` cookies are included because they are first-party
 * on our own domain, so we can and must remove them: telling GA that consent
 * is denied stops it writing *new* identifiers, but the one already on the
 * device would otherwise sit there for two years. `_ga_<id>` is named per
 * measurement id, so it is matched by prefix rather than listed.
 *
 * A cookie set with an explicit domain (Google uses the registrable domain)
 * cannot always be cleared without naming that domain, so each one is
 * expired against both the current host and its parent.
 */
function clearRejected(record: ConsentChoice) {
  const doomed: string[] = [];
  if (!record.measurement) {
    doomed.push("outlyy_aid", "outlyy_sid");
    for (const name of document.cookie.split(";")) {
      const key = name.split("=")[0]?.trim();
      if (key?.startsWith("_ga")) doomed.push(key);
    }
  }
  if (!record.marketing) doomed.push("outlyy_attr");

  const host = typeof location !== "undefined" ? location.hostname : "";
  const parent = host.split(".").slice(-2).join(".");
  const domains = [undefined, host, `.${host}`, parent ? `.${parent}` : undefined];

  for (const name of doomed) {
    for (const domain of domains) {
      try {
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
      } catch {
        /* nothing more we can do */
      }
    }
  }
}

/** Subscribe to changes (banner → analytics, footer link → banner). Returns an unsubscribe. */
export function onConsentChange(fn: (c: ConsentChoice) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => fn((e as CustomEvent<ConsentChoice>).detail);
  window.addEventListener(CONSENT_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, handler);
}

/** Reopen the banner from anywhere (the footer's "Cookie settings" link). */
export const CONSENT_REOPEN_EVENT = "outlyy:consent-reopen";
export function openConsentSettings() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONSENT_REOPEN_EVENT));
}

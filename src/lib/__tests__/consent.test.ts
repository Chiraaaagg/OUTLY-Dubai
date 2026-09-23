import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_ALL,
  CONSENT_COOKIE,
  CONSENT_NONE,
  CONSENT_VERSION,
  getConsent,
  hasConsent,
  onConsentChange,
  setConsent,
} from "../consent";

/**
 * The whole point of this module is that an *undecided* visitor is treated as
 * a refusal. These tests exist because the failure mode is silent: a bug here
 * does not throw, it just sets a tracking cookie on someone who never agreed.
 */

/** Minimal document.cookie stand-in with real overwrite + Max-Age=0 deletion. */
function installCookieJar() {
  const jar = new Map<string, string>();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      },
      set cookie(raw: string) {
        const [pair, ...attrs] = raw.split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1);
        if (attrs.some((a) => /max-age\s*=\s*0\s*$/i.test(a.trim()))) jar.delete(name);
        else jar.set(name, value);
      },
    },
  });
  return jar;
}

describe("cookie consent", () => {
  let jar: Map<string, string>;

  beforeEach(() => {
    jar = installCookieJar();
    // `setConsent` dispatches on window; a stub is enough.
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), { location: { protocol: "http:" } }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("an undecided visitor has consented to nothing", () => {
    expect(getConsent()).toBeNull();
    expect(hasConsent("measurement")).toBe(false);
    expect(hasConsent("marketing")).toBe(false);
  });

  it("records an accept-all decision with a timestamp", () => {
    const record = setConsent(CONSENT_ALL);
    expect(record.measurement).toBe(true);
    expect(record.marketing).toBe(true);
    expect(Date.parse(record.at)).not.toBeNaN();
    expect(hasConsent("measurement")).toBe(true);
    expect(hasConsent("marketing")).toBe(true);
  });

  it("accepts one category without the other", () => {
    setConsent({ measurement: true, marketing: false });
    expect(hasConsent("measurement")).toBe(true);
    expect(hasConsent("marketing")).toBe(false);
  });

  it("deletes the cookies of a category that is refused", () => {
    jar.set("outlyy_aid", "abc");
    jar.set("outlyy_sid", "def");
    jar.set("outlyy_attr", "%7B%7D");

    setConsent({ measurement: true, marketing: false });
    expect(jar.has("outlyy_attr")).toBe(false);
    expect(jar.has("outlyy_aid")).toBe(true);

    setConsent(CONSENT_NONE);
    expect(jar.has("outlyy_aid")).toBe(false);
    expect(jar.has("outlyy_sid")).toBe(false);
  });

  it("removes Google Analytics' own cookies when measurement is withdrawn", () => {
    // GA writes these first-party on our domain. Denying consent stops it
    // writing new ones; the identifier already on the device has to be deleted.
    jar.set("_ga", "GA1.1.123.456");
    jar.set("_ga_5SRV9WHCEG", "GS1.1.789");
    jar.set("outlyy_customer_session", "keep-me");

    setConsent(CONSENT_NONE);

    expect(jar.has("_ga")).toBe(false);
    expect(jar.has("_ga_5SRV9WHCEG")).toBe(false);
    // Strictly necessary cookies are never touched.
    expect(jar.get("outlyy_customer_session")).toBe("keep-me");
  });

  it("leaves analytics cookies alone while measurement is still granted", () => {
    jar.set("_ga", "GA1.1.123.456");
    setConsent({ measurement: true, marketing: false });
    expect(jar.has("_ga")).toBe(true);
  });

  it("ignores a record from an older consent version, so the banner asks again", () => {
    jar.set(
      CONSENT_COOKIE,
      encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION - 1, measurement: true, marketing: true, at: new Date().toISOString() })),
    );
    expect(getConsent()).toBeNull();
    expect(hasConsent("measurement")).toBe(false);
  });

  it("treats an unreadable cookie as no decision rather than throwing", () => {
    jar.set(CONSENT_COOKIE, "not-json");
    expect(getConsent()).toBeNull();
  });

  it("notifies subscribers so a withdrawal takes effect without a reload", () => {
    const seen: boolean[] = [];
    const off = onConsentChange((c) => seen.push(c.marketing));
    setConsent(CONSENT_ALL);
    setConsent(CONSENT_NONE);
    off();
    setConsent(CONSENT_ALL);
    expect(seen).toEqual([true, false]);
  });
});

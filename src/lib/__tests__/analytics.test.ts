import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENT_NAMES,
  deriveFbc,
  mergeAttribution,
  parseAttributionFromUrl,
  type Attribution,
} from "../analytics";

const SITE = "https://outlyy.com";
const NOW = Date.UTC(2026, 8, 14, 10, 0, 0);

describe("deriveFbc", () => {
  it("formats fbclid in Meta's fb.1.<ts>.<fbclid> shape", () => {
    expect(deriveFbc("IwAR0abc", 1700000000123)).toBe("fb.1.1700000000123.IwAR0abc");
  });

  it("returns undefined for empty input", () => {
    expect(deriveFbc(undefined, NOW)).toBeUndefined();
    expect(deriveFbc("", NOW)).toBeUndefined();
    expect(deriveFbc("   ", NOW)).toBeUndefined();
  });

  it("truncates absurdly long click ids", () => {
    const fbc = deriveFbc("x".repeat(1000), NOW)!;
    expect(fbc.length).toBeLessThanOrEqual(220);
  });
});

describe("parseAttributionFromUrl", () => {
  it("reads utm parameters and click ids", () => {
    const t = parseAttributionFromUrl(
      `${SITE}/activities/desert-safari?utm_source=meta&utm_medium=paid_social&utm_campaign=safari_sep&utm_term=t&utm_content=c&fbclid=FB123`,
      "https://l.facebook.com/l.php?u=...",
    );
    expect(t).toMatchObject({
      source: "meta",
      medium: "paid_social",
      campaign: "safari_sep",
      term: "t",
      content: "c",
      fbclid: "FB123",
      landing: "/activities/desert-safari",
      hasSignal: true,
    });
    expect(t.referrer).toBe("https://l.facebook.com/l.php");
  });

  it("infers facebook / paid_social from a bare fbclid", () => {
    const t = parseAttributionFromUrl(`${SITE}/?fbclid=ABC`, "");
    expect(t.source).toBe("facebook");
    expect(t.medium).toBe("paid_social");
    expect(t.hasSignal).toBe(true);
  });

  it("infers google / cpc from a bare gclid", () => {
    const t = parseAttributionFromUrl(`${SITE}/?gclid=G1`, "");
    expect(t).toMatchObject({ source: "google", medium: "cpc", gclid: "G1", hasSignal: true });
  });

  it("classifies external referrers as organic / social / referral", () => {
    expect(parseAttributionFromUrl(`${SITE}/`, "https://www.google.com/search?q=dubai")).toMatchObject({ source: "google.com", medium: "organic" });
    expect(parseAttributionFromUrl(`${SITE}/`, "https://www.instagram.com/p/x")).toMatchObject({ source: "instagram.com", medium: "social" });
    expect(parseAttributionFromUrl(`${SITE}/`, "https://someblog.example/post")).toMatchObject({ source: "someblog.example", medium: "referral" });
  });

  it("treats same-host referrers as internal navigation (no signal)", () => {
    const t = parseAttributionFromUrl(`${SITE}/cart`, `${SITE}/activities/x`);
    expect(t.hasSignal).toBe(false);
    expect(t.referrer).toBeUndefined();
    expect(t.source).toBeUndefined();
    expect(t.landing).toBe("/cart");
  });

  it("treats a direct visit as no signal and never throws on garbage", () => {
    expect(parseAttributionFromUrl(`${SITE}/`, "").hasSignal).toBe(false);
    expect(parseAttributionFromUrl("not a url", "also not").landing).toBe("/");
  });

  it("strips the referrer query string (no PII from third-party URLs)", () => {
    const t = parseAttributionFromUrl(`${SITE}/`, "https://mail.example.com/inbox?user=someone@example.com");
    expect(t.referrer).toBe("https://mail.example.com/inbox");
  });

  it("clips long values to 200 chars", () => {
    const t = parseAttributionFromUrl(`${SITE}/?utm_source=${"s".repeat(500)}`, "");
    expect(t.source!.length).toBe(200);
  });
});

describe("mergeAttribution", () => {
  const first = parseAttributionFromUrl(`${SITE}/lp/burj?utm_source=google&utm_medium=cpc&utm_campaign=burj&gclid=G1`, "https://www.google.com/");

  it("writes first and last touch on the first visit", () => {
    const a = mergeAttribution(null, first, NOW, undefined);
    expect(a.first_source).toBe("google");
    expect(a.first_medium).toBe("cpc");
    expect(a.first_campaign).toBe("burj");
    expect(a.first_landing).toBe("/lp/burj");
    expect(a.first_touch_at).toBe(new Date(NOW).toISOString());
    expect(a.last_source).toBe("google");
    expect(a.last_touch_at).toBe(a.first_touch_at);
    expect(a.gclid).toBe("G1");
    expect(a.fbc).toBeUndefined();
  });

  it("records a direct first visit as direct/none", () => {
    const a = mergeAttribution(null, parseAttributionFromUrl(`${SITE}/`, ""), NOW);
    expect(a.first_source).toBe("direct");
    expect(a.first_medium).toBe("none");
    expect(a.last_source).toBe("direct");
  });

  it("keeps first touch and replaces last touch on a new campaign signal", () => {
    const a = mergeAttribution(null, first, NOW);
    const later = NOW + 3 * 86_400_000;
    const second = parseAttributionFromUrl(`${SITE}/activities/safari?utm_source=meta&utm_medium=paid_social&fbclid=FB9`, "https://l.facebook.com/");
    const b = mergeAttribution(a, second, later, "fb.1.123.456");
    expect(b.first_source).toBe("google");
    expect(b.first_touch_at).toBe(new Date(NOW).toISOString());
    expect(b.last_source).toBe("meta");
    expect(b.last_medium).toBe("paid_social");
    expect(b.last_landing).toBe("/activities/safari");
    expect(b.last_touch_at).toBe(new Date(later).toISOString());
    // Click ids accumulate: gclid from the first visit survives, fbclid/fbc added now.
    expect(b.gclid).toBe("G1");
    expect(b.fbclid).toBe("FB9");
    expect(b.fbc).toBe(`fb.1.${later}.FB9`);
    expect(b.fbp).toBe("fb.1.123.456");
  });

  it("leaves everything untouched on internal navigation", () => {
    const a = mergeAttribution(null, first, NOW);
    const b = mergeAttribution(a, parseAttributionFromUrl(`${SITE}/cart`, `${SITE}/lp/burj`), NOW + 1000);
    expect(b).toEqual(a);
  });

  it("does not overwrite an existing fbp with an empty value", () => {
    const a: Attribution = { first_touch_at: new Date(NOW).toISOString(), fbp: "fb.1.1.1" };
    const b = mergeAttribution(a, parseAttributionFromUrl(`${SITE}/`, ""), NOW, "");
    expect(b.fbp).toBe("fb.1.1.1");
  });

  it("stays within the 30-key bound of the inquiry attribution schema", () => {
    const a = mergeAttribution(null, first, NOW, "fb.1.1.1");
    const b = mergeAttribution(a, parseAttributionFromUrl(`${SITE}/?utm_source=x&utm_medium=y&utm_campaign=z&utm_term=t&utm_content=c&fbclid=f&gclid=g`, "https://x.example/"), NOW + 1);
    expect(Object.keys(b).length).toBeLessThanOrEqual(20);
    for (const v of Object.values(b)) expect(typeof v).toBe("string");
  });
});

describe("ANALYTICS_EVENT_NAMES", () => {
  it("contains the inquiry pipeline events the server emits", () => {
    for (const n of ["inquiry_submitted", "inquiry_first_response", "inquiry_quoted", "inquiry_won", "inquiry_lost", "inquiry_sla_breached", "booking_confirmed"]) {
      expect(ANALYTICS_EVENT_NAMES).toContain(n);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(ANALYTICS_EVENT_NAMES).size).toBe(ANALYTICS_EVENT_NAMES.length);
  });
});

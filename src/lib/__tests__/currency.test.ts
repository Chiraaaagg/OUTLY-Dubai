import { describe, expect, it } from "vitest";
import {
  AED_PER_USD_PEG,
  allDisplays,
  amountIn,
  currencyForCountry,
  DEFAULT_CURRENCY,
  currencyFromCookieString,
  formatIn,
  isDisplayCurrency,
  priceInDisplay,
  transactionCurrency,
  usdFromAed,
} from "../currency";
import type { Money } from "../types";

/** A real catalogue row: stored in both currencies, never in USD. */
const desertSafari: Money = { inr: 5800, aed: 249 };

describe("display currency", () => {
  describe("geo → currency", () => {
    it("routes the three cases the business cares about", () => {
      expect(currencyForCountry("AE")).toBe("AED");
      expect(currencyForCountry("IN")).toBe("INR");
      expect(currencyForCountry("US")).toBe("USD");
      expect(currencyForCountry("GB")).toBe("USD");
      expect(currencyForCountry("DE")).toBe("USD");
      expect(currencyForCountry("SG")).toBe("USD");
      expect(currencyForCountry("AU")).toBe("USD");
    });

    it("is case- and whitespace-insensitive, because headers are not tidy", () => {
      expect(currencyForCountry(" ae ")).toBe("AED");
      expect(currencyForCountry("in")).toBe("INR");
    });

    it("falls back to the AED default when the edge could not locate the visitor", () => {
      expect(DEFAULT_CURRENCY).toBe("AED");
      expect(currencyForCountry(null)).toBe(DEFAULT_CURRENCY);
      expect(currencyForCountry(undefined)).toBe(DEFAULT_CURRENCY);
      expect(currencyForCountry("")).toBe(DEFAULT_CURRENCY);
      // The platforms' own "unknown" placeholders are not countries.
      expect(currencyForCountry("XXX")).toBe(DEFAULT_CURRENCY);
      expect(currencyForCountry("U")).toBe(DEFAULT_CURRENCY);
    });

    it("still sends a located visitor outside AE and IN to dollars", () => {
      expect(currencyForCountry("US")).toBe("USD");
      expect(currencyForCountry("XX")).toBe("USD"); // two letters, just not a country we special-case
    });
  });

  describe("conversion", () => {
    it("derives USD from the stored dirham at the central-bank peg", () => {
      expect(AED_PER_USD_PEG).toBe(3.6725);
      expect(usdFromAed(249)).toBe(Math.round(249 / 3.6725));
      expect(usdFromAed(3672.5)).toBe(1000);
      expect(usdFromAed(0)).toBe(0);
    });

    it("never derives INR — rupee prices are authored, not calculated", () => {
      // The stored rupee figure is returned untouched, whatever the dirham says.
      expect(amountIn(desertSafari, "INR")).toBe(5800);
      expect(amountIn({ inr: 1, aed: 999999 }, "INR")).toBe(1);
    });

    it("returns the stored dirham figure unchanged", () => {
      expect(amountIn(desertSafari, "AED")).toBe(249);
    });
  });

  describe("formatting", () => {
    it("uses symbols, never a flag or a country name", () => {
      expect(formatIn(5800, "INR")).toBe("₹5,800");
      expect(formatIn(249, "AED")).toBe("AED 249");
      expect(formatIn(68, "USD")).toBe("$68");
    });

    it("groups digits per locale and shows whole units", () => {
      expect(formatIn(1234567, "INR")).toBe("₹12,34,567");
      expect(formatIn(1234567, "USD")).toBe("$1,234,567");
      expect(formatIn(249.7, "AED")).toBe("AED 250");
    });

    it("renders one amount in all three currencies for the static HTML", () => {
      const all = allDisplays(desertSafari);
      expect(all.INR).toBe("₹5,800");
      expect(all.AED).toBe("AED 249");
      expect(all.USD).toBe(`$${usdFromAed(249)}`);
      expect(Object.keys(all)).toHaveLength(3);
    });

    it("priceInDisplay agrees with allDisplays for every currency", () => {
      const all = allDisplays(desertSafari);
      for (const c of ["INR", "AED", "USD"] as const) {
        expect(priceInDisplay(desertSafari, c)).toBe(all[c]);
      }
    });
  });

  describe("display vs transaction currency", () => {
    it("records a USD visitor's enquiry in AED, the currency the business quotes in", () => {
      expect(transactionCurrency("USD")).toBe("AED");
      expect(transactionCurrency("AED")).toBe("AED");
      expect(transactionCurrency("INR")).toBe("INR");
    });
  });

  describe("cookie", () => {
    it("reads the choice out of a cookie header", () => {
      expect(currencyFromCookieString("a=1; outlyy_ccy=AED; b=2")).toBe("AED");
      expect(currencyFromCookieString("outlyy_ccy=USD")).toBe("USD");
    });

    it("rejects anything that is not a currency we display", () => {
      expect(currencyFromCookieString("outlyy_ccy=EUR")).toBeNull();
      expect(currencyFromCookieString("outlyy_ccy=")).toBeNull();
      expect(currencyFromCookieString("")).toBeNull();
      expect(currencyFromCookieString(null)).toBeNull();
    });

    it("does not match a cookie whose name merely ends the same way", () => {
      expect(currencyFromCookieString("not_outlyy_ccy=AED")).toBeNull();
    });
  });

  it("validates display currencies", () => {
    expect(isDisplayCurrency("INR")).toBe(true);
    expect(isDisplayCurrency("USD")).toBe(true);
    expect(isDisplayCurrency("EUR")).toBe(false);
    expect(isDisplayCurrency(null)).toBe(false);
  });
});

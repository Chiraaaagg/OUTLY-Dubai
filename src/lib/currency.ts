import type { Currency, Money } from "./types";

/**
 * Display currency — what the visitor *sees*. Not what anything is stored in.
 *
 * ## The rule
 *
 *   UAE        → AED
 *   India      → INR
 *   everywhere → USD
 *
 * ## Storage is untouched
 *
 * `Money` stays `{ inr, aed }` and every stored row keeps both figures. AED is
 * the operator-facing source of truth and INR is the authored all-in rupee
 * price, which is the brand's whole promise — neither is recomputed here. USD
 * is the only *derived* figure, and it is derived at render time and never
 * written anywhere. There is no third price record, no per-currency route and
 * no duplicated catalogue.
 *
 * ## Why there is no exchange-rate API
 *
 * The UAE dirham has been hard-pegged to the US dollar at **3.6725 AED = 1 USD**
 * since 1997. The peg is set by the UAE Central Bank, not by a market, so a
 * live rate feed for AED→USD would return the same constant every time while
 * costing a network call, a cache layer and a failure mode on the render path.
 * The peg is the rate. `NEXT_PUBLIC_AED_PER_USD` overrides it if the business
 * ever wants a different display rate (a rounding cushion, say), and the
 * override is read once at module load — never per render.
 *
 * INR is *not* converted: rupee prices are authored, not calculated, so there
 * is no rupee rate to fetch either. That is what makes this whole system
 * zero-API and zero-latency.
 */

export type DisplayCurrency = Currency | "USD";

export const DISPLAY_CURRENCIES: readonly DisplayCurrency[] = ["INR", "AED", "USD"];

/** Cookie the middleware writes and the pre-paint script reads. Not httpOnly — the client needs it. */
export const CURRENCY_COOKIE = "outlyy_ccy";

/** UAE Central Bank peg, fixed since 1997. */
export const AED_PER_USD_PEG = 3.6725;

function configuredRate(): number {
  const raw = Number.parseFloat(process.env.NEXT_PUBLIC_AED_PER_USD ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : AED_PER_USD_PEG;
}

/** AED per 1 USD. Constant for the lifetime of the process. */
export const AED_PER_USD = configuredRate();

export function isDisplayCurrency(v: unknown): v is DisplayCurrency {
  return typeof v === "string" && (DISPLAY_CURRENCIES as readonly string[]).includes(v);
}

/* ------------------------------------------------------------------ geo --- */

/**
 * The single default, used everywhere a visitor has not been identified: the
 * pre-paint script, the CSS fallback for a blocked script, React's initial
 * state and a crawler with no cookie all show AED.
 *
 * AED is the currency the catalogue is actually sold in, so it is the one
 * figure that is never a conversion and never wrong. The previous split —
 * rupees in the CSS, dollars from geo — meant two different "defaults"
 * depending on which path you came down.
 */
export const DEFAULT_CURRENCY: DisplayCurrency = "AED";

/**
 * ISO-3166 alpha-2 → what that visitor should see.
 *
 *   AE → AED · IN → INR · everywhere else → USD
 *
 * An unknown country (no edge header, a malformed code, or the platforms'
 * `XX`/`T1` placeholders) falls back to `DEFAULT_CURRENCY`, not to USD: if we
 * cannot tell where someone is, showing them the price the operator quotes
 * beats guessing a conversion.
 */
export function currencyForCountry(country: string | null | undefined): DisplayCurrency {
  const code = country?.trim().toUpperCase();
  if (!code || code.length !== 2) return DEFAULT_CURRENCY;
  if (code === "AE") return "AED";
  if (code === "IN") return "INR";
  return "USD";
}

/**
 * The currency a record is *written* in, from the currency a visitor is
 * *shown*.
 *
 * Inquiries and orders store INR or AED — the two the business actually
 * quotes, invoices and settles in. USD exists only on the screen, so a visitor
 * browsing in dollars has their enquiry recorded in AED, the operator-facing
 * source of truth. Without this the display layer would quietly invent a
 * currency the back office cannot honour.
 */
export function transactionCurrency(display: DisplayCurrency): Currency {
  return display === "INR" ? "INR" : "AED";
}

/* -------------------------------------------------------------- amounts --- */

/** Whole dollars from the stored dirham figure. Rounded, never stored. */
export function usdFromAed(aed: number): number {
  return Math.round(aed / AED_PER_USD);
}

/** The amount to show, in the visitor's currency. */
export function amountIn(money: Money, currency: DisplayCurrency): number {
  if (currency === "AED") return money.aed;
  if (currency === "USD") return usdFromAed(money.aed);
  return money.inr;
}

const LOCALES: Record<DisplayCurrency, string> = { INR: "en-IN", AED: "en-AE", USD: "en-US" };

/**
 * Formatted price. Symbols only — never a flag, never a banknote. A flag is a
 * country, not a currency, and half the world's USD users are not American.
 */
export function formatIn(value: number, currency: DisplayCurrency): string {
  const n = value.toLocaleString(LOCALES[currency], { maximumFractionDigits: 0 });
  if (currency === "AED") return `AED ${n}`;
  if (currency === "USD") return `$${n}`;
  return `₹${n}`;
}

/** Formatted price for a stored `Money`, in the visitor's currency. */
export function priceInDisplay(money: Money, currency: DisplayCurrency): string {
  return formatIn(amountIn(money, currency), currency);
}

/** Every currency's rendering of one amount — what `<Price>` bakes into static HTML. */
export function allDisplays(money: Money): Record<DisplayCurrency, string> {
  return {
    INR: formatIn(money.inr, "INR"),
    AED: formatIn(money.aed, "AED"),
    USD: formatIn(usdFromAed(money.aed), "USD"),
  };
}

/** Short label for the switcher. */
export const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  INR: "₹ INR",
  AED: "AED",
  USD: "$ USD",
};

/* --------------------------------------------------------------- cookie --- */

const YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Read the choice from a cookie string (works on the server and the client). */
export function currencyFromCookieString(raw: string | undefined | null): DisplayCurrency | null {
  if (!raw) return null;
  const prefix = `${CURRENCY_COOKIE}=`;
  for (const part of raw.split(";")) {
    const p = part.trim();
    if (p.startsWith(prefix)) {
      const value = decodeURIComponent(p.slice(prefix.length));
      return isDisplayCurrency(value) ? value : null;
    }
  }
  return null;
}

/**
 * Persist the visitor's currency.
 *
 * Strictly necessary, so it is not behind the consent banner: it records a
 * display preference the visitor set (or that their location implies), stores
 * no identifier, and is exactly the "user-interface customisation" cookie that
 * PECR exempts. It is listed on /cookies under strictly necessary.
 */
export function writeCurrencyCookie(currency: DisplayCurrency) {
  if (typeof document === "undefined") return;
  try {
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CURRENCY_COOKIE}=${currency}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    /* cookies disabled — the choice lasts for this page only */
  }
}

/**
 * The script that runs before first paint.
 *
 * Storefront pages are statically prerendered, so the server cannot bake a
 * per-visitor currency into them. Instead every price ships all three
 * renderings and CSS shows one, keyed off `data-ccy` on `<html>`. This sets
 * that attribute from the cookie *before* the browser paints, so there is no
 * flash of the wrong currency and no layout shift — and because it only
 * touches an attribute, React's hydration never sees a mismatch.
 */
export const CURRENCY_BOOTSTRAP_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${CURRENCY_COOKIE}=(INR|AED|USD)/);document.documentElement.setAttribute('data-ccy',m?m[1]:'${DEFAULT_CURRENCY}')}catch(e){document.documentElement.setAttribute('data-ccy','${DEFAULT_CURRENCY}')}})()`;

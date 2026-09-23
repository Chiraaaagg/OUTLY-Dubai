import type { BudgetBand, Currency, Dietary, InquirySource, Money } from "@/lib/types";
import { formatDateKey, priceIn } from "@/lib/utils";

/**
 * Display helpers for the inquiry console. Every date is rendered with an
 * explicit timeZone so the server and the client agree (no hydration drift),
 * and that timeZone is the SLA's own — a console hard-coded to IST while the
 * SLA ran on Dubai time showed the right instant under the wrong label.
 */

export const CONSOLE_TZ = process.env.NEXT_PUBLIC_SLA_TIMEZONE ?? "Asia/Dubai";

/** "IST" / "GST" / the raw IANA name. Use it instead of writing a label by hand. */
export const CONSOLE_TZ_LABEL =
  CONSOLE_TZ === "Asia/Kolkata" ? "IST" : CONSOLE_TZ === "Asia/Dubai" ? "GST" : CONSOLE_TZ;

export function fmtMoney(money: Money, currency: Currency): string {
  return priceIn(money, currency);
}

export function fmtBoth(money: Money): string {
  return `${priceIn(money, "INR")} · ${priceIn(money, "AED")}`;
}

export function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CONSOLE_TZ,
  });
}

export function fmtTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: CONSOLE_TZ });
}

export function fmtDate(key: string | undefined | null): string {
  if (!key) return "—";
  return formatDateKey(key, { year: undefined });
}

export function fmtDateRange(from?: string, to?: string, flexible?: boolean): string {
  if (!from) return flexible ? "Dates flexible" : "No date yet";
  const range = to && to !== from ? `${fmtDate(from)} – ${fmtDate(to)}` : fmtDate(from);
  return flexible ? `${range} (flexible)` : range;
}

/** "3m ago" / "in 12m" / "2d ago". Deterministic given `nowMs`. */
export function relative(iso: string, nowMs: number): string {
  const diff = new Date(iso).getTime() - nowMs;
  const abs = Math.abs(diff);
  const past = diff < 0;
  const unit =
    abs < 60_000
      ? "just now"
      : abs < 3_600_000
        ? `${Math.round(abs / 60_000)}m`
        : abs < 86_400_000
          ? `${Math.round(abs / 3_600_000)}h`
          : `${Math.round(abs / 86_400_000)}d`;
  if (unit === "just now") return unit;
  return past ? `${unit} ago` : `in ${unit}`;
}

/** Minutes → "4m" / "1h 12m" for SLA and first-response figures. */
export function fmtMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function waDigits(phoneE164: string): string {
  return phoneE164.replace(/\D/g, "");
}

export function waLink(phoneE164: string, text: string): string {
  return `https://wa.me/${waDigits(phoneE164)}?text=${encodeURIComponent(text)}`;
}

export const SOURCE_LABELS: Record<InquirySource, string> = {
  inquiry_form: "Inquiry form",
  whatsapp: "WhatsApp",
  concierge: "Concierge",
  contact_form: "Contact form",
  quote_request: "Quote request",
  agent_created: "Agent created",
  abandoned_cart: "Abandoned cart",
};

export const BUDGET_LABELS: Record<BudgetBand, string> = {
  under_25k: "Under ₹25k",
  "25k_60k": "₹25k – ₹60k",
  "60k_150k": "₹60k – ₹1.5L",
  "150k_plus": "₹1.5L+",
  unsure: "Not sure yet",
};

export const DIETARY_LABELS: Record<Dietary, string> = {
  veg: "Veg",
  jain: "Jain",
  halal: "Halal",
  "non-veg": "Non-veg",
};

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

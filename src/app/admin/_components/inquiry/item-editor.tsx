"use client";

import { useActionState, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/primitives";
import { cn, formatDuration, paxLabel } from "@/lib/utils";
import type { Currency } from "@/lib/types";
import type { InquiryItemDetail } from "@/server/services/inquiry.types";
import { updateInquiryItem } from "@/app/admin/_actions/inquiries";
import type { ActionResult } from "@/app/admin/_actions/result";
import { fmtBoth, fmtDate, fmtDateTime, fmtMoney } from "./format";

const FIELD =
  "w-full rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 tnum focus:border-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sun-300 disabled:opacity-60";

type ItemResult = ActionResult<{ toleranceExceeded: boolean; tolerancePercent: number }>;

/**
 * One inquiry item: what the customer saw (indicative) next to what the agent
 * has confirmed with the supplier, plus the inline editor. The tolerance
 * warning from `updateItem` stays on screen until dismissed — quoting higher
 * quietly is the one thing §17 §7.5 forbids.
 */
export function ItemEditor({
  inquiryId,
  item,
  currency,
  canEdit,
}: {
  inquiryId: string;
  item: InquiryItemDetail;
  currency: Currency;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [warning, setWarning] = useState<{ percent: number } | null>(null);
  const [state, submit, pending] = useActionState<ItemResult | null, FormData>(async (_prev, formData) => {
    const inr = String(formData.get("confirmedInr") ?? "").trim();
    const aed = String(formData.get("confirmedAed") ?? "").trim();
    const clear = formData.get("clearConfirmed") === "on";
    const r = await updateInquiryItem({
      id: inquiryId,
      itemId: item.id,
      confirmedInr: clear || inr === "" ? undefined : Number(inr),
      confirmedAed: clear || aed === "" ? undefined : Number(aed),
      clearConfirmed: clear || undefined,
      availabilityNote: String(formData.get("availabilityNote") ?? ""),
      availabilityChecked: formData.get("availabilityChecked") === "on" || undefined,
    });
    if (r.ok) {
      setWarning(r.data.toleranceExceeded ? { percent: r.data.tolerancePercent } : null);
      setOpen(false);
    }
    return r;
  }, null);

  const confirmed = item.confirmedTotal;
  const delta = confirmed ? Math.round(((confirmed.inr - item.indicativeTotal.inr) / Math.max(1, item.indicativeTotal.inr)) * 100) : null;

  return (
    <li className="rounded-[var(--radius-control)] border border-ink-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink-900">{item.title}</span>
            <Badge tone="neutral" size="sm">
              {item.kind === "combo" ? "Combo" : `Tier ${item.tier}`}
            </Badge>
            {item.fulfilmentMode === "instant" && (
              <Badge tone="trust" size="sm">
                Instant SKU
              </Badge>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {item.date ? fmtDate(item.date) : <span className="font-semibold text-[var(--color-warning)]">No date — needed before conversion</span>}
              {item.time ? ` · ${item.time}` : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDuration(item.durationMinutes)}
            </span>
            <span>{paxLabel(item.pax)}</span>
            {item.variantName && <span>{item.variantName}</span>}
            {item.addOnIds.length > 0 && <span>+{item.addOnIds.length} add-on{item.addOnIds.length > 1 ? "s" : ""}</span>}
          </p>
        </div>
        {canEdit && !open && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} aria-expanded={open}>
            <Pencil className="h-3.5 w-3.5" /> Edit figures
          </Button>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-2xs font-bold uppercase tracking-wider text-ink-500">Customer saw</dt>
          <dd className="font-semibold tnum text-ink-800" title={fmtBoth(item.indicativeTotal)}>
            {fmtMoney(item.indicativeTotal, currency)}
            <span className="ml-1 text-xs font-normal text-ink-500">({fmtMoney(item.indicativeUnit, currency)} / unit)</span>
          </dd>
        </div>
        <div>
          <dt className="text-2xs font-bold uppercase tracking-wider text-ink-500">Confirmed</dt>
          <dd className={cn("font-semibold tnum", confirmed ? "text-ink-900" : "text-ink-400")} title={confirmed ? fmtBoth(confirmed) : undefined}>
            {confirmed ? fmtMoney(confirmed, currency) : "Not yet"}
            {delta !== null && delta !== 0 && (
              <span className={cn("ml-1 text-xs font-bold", delta > 0 ? "text-[var(--color-warning)]" : "text-[var(--color-success)]")}>
                {delta > 0 ? "+" : ""}
                {delta}%
              </span>
            )}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-2xs font-bold uppercase tracking-wider text-ink-500">Availability</dt>
          <dd className="text-ink-800">
            {item.availabilityCheckedAt ? (
              <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Checked {fmtDateTime(item.availabilityCheckedAt)}
              </span>
            ) : (
              <span className="text-ink-400">Not checked</span>
            )}
          </dd>
        </div>
      </dl>
      {item.availabilityNote && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-700">{item.availabilityNote}</p>}

      {warning && (
        <Alert
          tone="warning"
          className="mt-3"
          title={`Confirmed price is more than ${warning.percent}% above what the customer saw`}
          action={
            <Button type="button" variant="ghost" size="sm" onClick={() => setWarning(null)}>
              Understood
            </Button>
          }
        >
          Tell them the old price, the new price and why before quoting. Never quote higher quietly.
        </Alert>
      )}
      {state?.ok && !warning && !open && <p className="mt-2 text-xs font-semibold text-[var(--color-success)]">Saved.</p>}

      {open && (
        <form action={submit} className="mt-3 space-y-3 rounded-[var(--radius-control)] bg-shell/70 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-ink-700">
              Confirmed total (INR)
              <input name="confirmedInr" type="number" min={0} step={1} inputMode="numeric" defaultValue={confirmed?.inr ?? ""} placeholder={`Saw ${item.indicativeTotal.inr}`} className={cn(FIELD, "mt-1")} disabled={pending} />
            </label>
            <label className="block text-xs font-semibold text-ink-700">
              Confirmed total (AED)
              <input name="confirmedAed" type="number" min={0} step={1} inputMode="numeric" defaultValue={confirmed?.aed ?? ""} placeholder={`Saw ${item.indicativeTotal.aed}`} className={cn(FIELD, "mt-1")} disabled={pending} />
            </label>
          </div>
          <p className="text-xs text-ink-500">Leave both blank to only update availability. Both currencies are stored; the customer sees {currency}.</p>
          <label className="block text-xs font-semibold text-ink-700">
            Availability note
            <textarea
              name="availabilityNote"
              rows={2}
              maxLength={500}
              defaultValue={item.availabilityNote ?? ""}
              placeholder="e.g. Supplier confirmed 2 seats on the 14th, pickup 3pm"
              className={cn(FIELD, "mt-1")}
              disabled={pending}
            />
          </label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input name="availabilityChecked" type="checkbox" className="h-4 w-4 accent-[var(--color-sun-500)]" disabled={pending} />
              Availability checked with the supplier now
            </label>
            {confirmed && (
              <label className="inline-flex min-h-11 items-center gap-2 text-ink-600">
                <input name="clearConfirmed" type="checkbox" className="h-4 w-4 accent-[var(--color-sun-500)]" disabled={pending} />
                Clear confirmed price
              </label>
            )}
          </div>
          {state && !state.ok && (
            <Alert tone="danger" title={state.message}>
              {Object.values(state.fields ?? {})[0] ?? state.recovery}
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" size="sm" loading={pending} loadingLabel="Saving">
              Save figures
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

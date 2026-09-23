"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { setFulfilmentModeAction, type SetFulfilmentModeResult } from "../../_actions/products";
import { INPUT_CLASS } from "../../_components/ui";

/**
 * Inline flip form for one SKU. Reason is mandatory (the service refuses
 * without one). Errors from the service (e.g. "needs an API supplier
 * mapping") render inline under the row.
 */
export function FulfilmentFlip({ id, kind, name, current }: { id: string; kind: "product" | "combo"; name: string; current: "inquiry" | "instant" }) {
  const [state, action, pending] = useActionState<SetFulfilmentModeResult | null, FormData>(setFulfilmentModeAction, null);
  const [open, setOpen] = useState(false);
  const target = current === "instant" ? "inquiry" : "instant";
  const reasonError = state && !state.ok ? state.fields?.reason : undefined;

  if (!open) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Switch to {target}
        </Button>
        {state?.ok && <p className="mt-1 text-2xs font-semibold text-[var(--color-success)]">Now {state.data.mode}.</p>}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="mode" value={target} />
      <label htmlFor={`reason-${id}`} className="block text-xs font-semibold text-ink-800">
        Reason for switching {name} to {target}
      </label>
      <input
        id={`reason-${id}`}
        name="reason"
        required
        minLength={8}
        maxLength={500}
        placeholder={target === "instant" ? "Rathin mapping verified on staging, go-live approved by…" : "Supplier API failing since…"}
        aria-invalid={reasonError ? true : undefined}
        className={`${INPUT_CLASS} min-h-10 text-sm`}
        autoFocus
      />
      {state && !state.ok && (
        <p className="text-xs font-semibold text-[var(--color-danger)]" role="alert">
          {reasonError ?? state.message}
        </p>
      )}
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" variant={target === "instant" ? "primary" : "secondary"} loading={pending} loadingLabel="Switching…">
          Confirm {target}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

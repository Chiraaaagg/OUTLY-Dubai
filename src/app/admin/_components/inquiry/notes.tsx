"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { addInquiryNote } from "@/app/admin/_actions/inquiries";
import type { ActionResult } from "@/app/admin/_actions/result";

/**
 * Internal notes composer. Notes are agent-only, never sent to the customer,
 * and land in the timeline as `note` events. Cmd/Ctrl+Enter submits.
 */
export function NotesComposer({ inquiryId, disabled }: { inquiryId: string; disabled?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState<ActionResult<undefined> | null, FormData>(async (_prev, formData) => {
    const note = String(formData.get("note") ?? "");
    const r = await addInquiryNote({ id: inquiryId, note });
    if (r.ok) formRef.current?.reset();
    return r;
  }, null);

  return (
    <form ref={formRef} action={submit} className="space-y-2">
      <label htmlFor={`note-${inquiryId}`} className="block text-xs font-bold uppercase tracking-wider text-ink-500">
        Add a note
      </label>
      <textarea
        id={`note-${inquiryId}`}
        name="note"
        rows={3}
        maxLength={2000}
        required
        disabled={disabled || pending}
        placeholder="Supplier said… customer prefers… (internal, never sent)"
        className="w-full rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sun-300 disabled:opacity-60"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") formRef.current?.requestSubmit();
        }}
      />
      {state && !state.ok && (
        <Alert tone="danger" title={state.message}>
          {state.fields?.note ?? state.recovery}
        </Alert>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-500">Ctrl/⌘ + Enter to save</span>
        <Button type="submit" variant="secondary" size="sm" loading={pending} loadingLabel="Saving" disabled={disabled}>
          Save note
        </Button>
      </div>
    </form>
  );
}

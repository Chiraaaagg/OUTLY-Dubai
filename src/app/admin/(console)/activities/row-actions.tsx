"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteActivityAction, duplicateActivityAction, restoreActivityAction, setActivityStatusAction, type ActivityRowResult } from "../../_actions/activities";
import { INPUT_CLASS } from "../../_components/ui";

export interface RowActionTarget {
  id: string;
  slug: string;
  title: string;
  status: string;
  deleted: boolean;
}

export interface RowCapabilities {
  publish: boolean;
  delete: boolean;
}

/**
 * Per-row lifecycle controls. Each button is its own tiny form bound to a
 * Server Action; delete asks for a reason inline (the service refuses
 * without one). After a successful action the list is refreshed.
 */
export function ActivityRowActions({ row, can, onDone }: { row: RowActionTarget; can: RowCapabilities; onDone?: () => void }) {
  const router = useRouter();
  const [statusState, statusAction, statusPending] = useActionState<ActivityRowResult | null, FormData>(setActivityStatusAction, null);
  const [dupState, dupAction, dupPending] = useActionState<ActivityRowResult | null, FormData>(duplicateActivityAction, null);
  const [delState, delAction, delPending] = useActionState<ActivityRowResult | null, FormData>(deleteActivityAction, null);
  const [restoreState, restoreAction, restorePending] = useActionState<ActivityRowResult | null, FormData>(restoreActivityAction, null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = statusState?.ok || dupState?.ok || delState?.ok || restoreState?.ok;
  useEffect(() => {
    if (done) {
      setConfirmDelete(false);
      onDone?.();
      router.refresh();
    }
  }, [done, onDone, router]);

  const error = [statusState, dupState, delState, restoreState].find((s) => s && !s.ok);
  const busy = statusPending || dupPending || delPending || restorePending;

  if (row.deleted) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {can.delete && (
          <form action={restoreAction}>
            <input type="hidden" name="id" value={row.id} />
            <Button type="submit" size="sm" variant="outline" loading={restorePending} loadingLabel="Restoring…">
              Restore
            </Button>
          </form>
        )}
        {error && !error.ok && <p className="w-full text-2xs font-semibold text-[var(--color-danger)]">{error.message}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {can.publish && row.status !== "published" && (
        <form action={statusAction}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="status" value="published" />
          <Button type="submit" size="sm" variant="primary" loading={statusPending} loadingLabel="Publishing…" disabled={busy}>
            Publish
          </Button>
        </form>
      )}
      {can.publish && row.status === "published" && (
        <form action={statusAction}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="status" value="draft" />
          <Button type="submit" size="sm" variant="outline" loading={statusPending} loadingLabel="Unpublishing…" disabled={busy}>
            Unpublish
          </Button>
        </form>
      )}
      {can.publish && row.status !== "archived" && (
        <form action={statusAction}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="status" value="archived" />
          <Button type="submit" size="sm" variant="ghost" loading={statusPending} loadingLabel="Archiving…" disabled={busy}>
            Archive
          </Button>
        </form>
      )}
      <form action={dupAction}>
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" size="sm" variant="ghost" loading={dupPending} loadingLabel="Copying…" disabled={busy}>
          Duplicate
        </Button>
      </form>
      {can.delete && !confirmDelete && (
        <Button type="button" size="sm" variant="ghost" className="text-[var(--color-danger)]" onClick={() => setConfirmDelete(true)} disabled={busy}>
          Delete
        </Button>
      )}
      {can.delete && confirmDelete && (
        <form action={delAction} className="flex w-full flex-wrap items-center gap-1.5">
          <input type="hidden" name="id" value={row.id} />
          <input name="reason" required minLength={3} maxLength={300} placeholder={`Why delete “${row.title}”?`} className={`${INPUT_CLASS} min-h-10 max-w-xs text-sm`} autoFocus aria-label="Reason for deletion" />
          <Button type="submit" size="sm" variant="danger" loading={delPending} loadingLabel="Deleting…">
            Confirm delete
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={delPending}>
            Cancel
          </Button>
        </form>
      )}
      {error && !error.ok && (
        <p className="w-full text-2xs font-semibold text-[var(--color-danger)]" role="alert">
          {error.fields?.reason ?? error.message}
        </p>
      )}
    </div>
  );
}

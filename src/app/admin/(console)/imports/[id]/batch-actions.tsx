"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { INPUT_CLASS } from "../../../_components/ui";

/**
 * Apply (previewed) / revert (applied) for one batch, via the JSON routes.
 *
 * Apply carries the same options as the wizard — publish, skip failed rows,
 * create missing categories — because a batch is often applied from here the
 * day after it was previewed, and silently applying with the defaults is how
 * 200 listings end up as drafts nobody asked for.
 */
export function BatchActions({
  id,
  status,
  canPublish,
  rowsFailed,
  missingCategories,
  canCreateCategories,
}: {
  id: string;
  status: string;
  canPublish: boolean;
  rowsFailed: number;
  missingCategories: string[];
  canCreateCategories: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [publish, setPublish] = useState(false);
  const [partial, setPartial] = useState(false);
  const [createCats, setCreateCats] = useState(true);

  const call = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
      }
      setConfirm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const showCreateCats = canCreateCategories && missingCategories.length > 0;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ButtonLink href="/admin/imports" variant="ghost" size="sm">
        All imports
      </ButtonLink>

      {status === "previewed" && (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5">
          {canPublish && (
            <label className="inline-flex items-center gap-2 text-sm text-ink-800">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4" /> Publish immediately
            </label>
          )}
          {rowsFailed > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-ink-800">
              <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="h-4 w-4" /> Skip the {rowsFailed} failed row{rowsFailed === 1 ? "" : "s"}
            </label>
          )}
          {showCreateCats && (
            <label className="inline-flex items-center gap-2 text-sm text-ink-800">
              <input type="checkbox" checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} className="h-4 w-4" /> Create {missingCategories.length} missing categor{missingCategories.length === 1 ? "y" : "ies"}
            </label>
          )}
          <Button
            size="sm"
            onClick={() => call(`/api/admin/imports/${id}/apply`, { partial, publish: publish && canPublish, createMissingCategories: showCreateCats && createCats })}
            loading={busy}
            loadingLabel="Importing…"
          >
            Apply {partial ? "valid rows" : "all rows"}
          </Button>
        </div>
      )}

      {status === "applied" && !confirm && (
        <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
          Revert this import
        </Button>
      )}
      {status === "applied" && confirm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void call(`/api/admin/imports/${id}/revert`, reason.trim().length >= 3 ? { reason: reason.trim() } : {});
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={300} className={`${INPUT_CLASS} min-h-9 w-56 text-sm`} />
          <Button type="submit" size="sm" variant="danger" loading={busy} loadingLabel="Reverting…">
            Confirm revert
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>
            Cancel
          </Button>
        </form>
      )}

      {error && (
        <p className="w-full text-right text-xs font-semibold text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { bulkAssignInquiries, type BulkAssignResult } from "@/app/admin/_actions/inquiries";
import type { RoutableAgent } from "@/app/admin/_components/inquiry/assign-picker";

/**
 * Multi-select over the queue rows with one bulk action: assign to an agent.
 *
 * Morning triage was one assignment at a time through the detail page — four
 * round trips each. The table itself stays a Server Component and is passed
 * in as `children`; the checkboxes inside it are plain uncontrolled
 * `name="ids"` inputs belonging to this form, so the queue keeps its
 * URL-driven filters, its back/forward behaviour and its server rendering.
 */

const FIELD =
  "min-h-10 rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sun-300 disabled:opacity-60";

export function QueueBulkBar({ agents, enabled, total, children }: { agents: RoutableAgent[]; enabled: boolean; /** Rows on this page — the ref cannot be read during render. */ total: number; children: ReactNode }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);
  const [agentId, setAgentId] = useState("");
  const [state, submit, pending] = useActionState<BulkAssignResult | null, FormData>(bulkAssignInquiries, null);

  useEffect(() => {
    if (state?.ok) {
      setCount(0);
      router.refresh();
    }
  }, [state, router]);

  if (!enabled) return <>{children}</>;

  const boxes = () => Array.from(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? []);
  const recount = () => setCount(boxes().filter((b) => b.checked).length);

  const setAll = (checked: boolean) => {
    for (const b of boxes()) b.checked = checked;
    recount();
  };

  const allChecked = total > 0 && count === total;
  const sorted = [...agents].sort((a, b) => a.openCount - b.openCount || a.name.localeCompare(b.name));

  return (
    <form ref={formRef} action={submit} onChange={recount} className="space-y-3">
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-paper p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink-800">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => setAll(e.target.checked)}
              disabled={pending}
              className="h-4 w-4"
              aria-label="Select every inquiry on this page"
            />
            {count === 0 ? "Tick inquiries to assign several at once" : `${count} selected`}
          </label>
          {count > 0 && (
            <button type="button" onClick={() => setAll(false)} className="text-sm text-ink-600 underline underline-offset-2">
              Clear
            </button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="bulk-agent">
              Assign to
            </label>
            <select id="bulk-agent" name="agentId" value={agentId} onChange={(e) => setAgentId(e.target.value)} className={FIELD} disabled={pending || !agents.length}>
              <option value="">Assign to…</option>
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.shift} · {a.openCount} open
                  {a.availability !== "available" ? ` · ${a.availability}` : ""}
                </option>
              ))}
            </select>
            <input name="reason" maxLength={300} placeholder="Why (optional, goes in the timeline)" className={`${FIELD} w-60`} aria-label="Reason for the bulk assignment" />
            <Button type="submit" size="sm" variant="secondary" disabled={count === 0 || !agentId || pending} loading={pending} loadingLabel="Assigning…">
              Assign {count || ""}
            </Button>
          </div>
        </div>

        {!agents.length && (
          <p className="mt-2 text-xs text-ink-500">No agent can receive inquiries yet — an account needs to be active, hold a routing role and finish two-factor enrolment.</p>
        )}
        {state && !state.ok && (
          <Alert tone="danger" title={state.message} className="mt-3">
            {state.fields?.agentId ?? state.fields?.ids ?? state.recovery}
          </Alert>
        )}
        {state?.ok && (
          <Alert tone={state.data.assigned > 0 ? "success" : "info"} title={summary(state.data)} className="mt-3">
            The agent is not messaged for a bulk assignment — the leads simply appear in their queue.
          </Alert>
        )}
      </div>

      {children}
    </form>
  );
}

function summary(d: { assigned: number; skipped: number; alreadyTheirs: number; agentName: string }) {
  const parts = [`${d.assigned} assigned to ${d.agentName}`];
  if (d.alreadyTheirs) parts.push(`${d.alreadyTheirs} already theirs`);
  if (d.skipped) parts.push(`${d.skipped} skipped — won, lost or spam`);
  return parts.join(" · ");
}

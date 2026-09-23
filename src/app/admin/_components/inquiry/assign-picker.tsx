"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { assignInquiry, unassignInquiry } from "@/app/admin/_actions/inquiries";
import type { ActionResult } from "@/app/admin/_actions/result";

/** Public fields only — built by the detail page from `adminRepo.listRoutable()`. */
export interface RoutableAgent {
  id: string;
  name: string;
  initials: string;
  shift: string;
  openCount: number;
  availability: "available" | "busy" | "away" | "offline";
  title?: string;
}

const FIELD =
  "w-full rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sun-300 disabled:opacity-60";

/**
 * Assign / reassign to any routable agent. Only rendered for actors with
 * `inquiries.assign`; the service refuses everyone else regardless.
 */
export function AssignPicker({
  inquiryId,
  agents,
  currentAgentId,
  disabled,
}: {
  inquiryId: string;
  agents: RoutableAgent[];
  currentAgentId?: string;
  disabled?: boolean;
}) {
  const [state, submit, pending] = useActionState<ActionResult<{ status: string }> | null, FormData>(async (_prev, formData) => {
    return assignInquiry({
      id: inquiryId,
      agentId: String(formData.get("agentId") ?? ""),
      reason: String(formData.get("reason") ?? "") || undefined,
    });
  }, null);

  const [releaseState, release, releasing] = useActionState<ActionResult<{ status: string }> | null, FormData>(async () => unassignInquiry({ id: inquiryId, reason: "Released to queue" }), null);

  const sorted = [...agents].sort((a, b) => a.openCount - b.openCount || a.name.localeCompare(b.name));

  return (
    <form action={submit} className="space-y-2.5">
      <label htmlFor={`assign-${inquiryId}`} className="block text-xs font-bold uppercase tracking-wider text-ink-500">
        {currentAgentId ? "Reassign to" : "Assign to"}
      </label>
      <select id={`assign-${inquiryId}`} name="agentId" required defaultValue={currentAgentId ?? ""} disabled={disabled || pending} className={FIELD}>
        <option value="" disabled>
          Choose an agent
        </option>
        {sorted.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.shift} · {a.openCount} open{a.availability !== "available" ? ` · ${a.availability}` : ""}
          </option>
        ))}
      </select>
      <input
        name="reason"
        type="text"
        maxLength={300}
        placeholder="Why (optional, goes in the timeline)"
        disabled={disabled || pending}
        className={FIELD}
      />
      {state && !state.ok && (
        <Alert tone="danger" title={state.message}>
          {state.fields?.agentId ?? state.recovery}
        </Alert>
      )}
      {state?.ok && <p className="text-xs font-semibold text-[var(--color-success)]">Assigned. The agent has been told.</p>}
      <Button type="submit" variant="outline" size="sm" block loading={pending} loadingLabel="Assigning" disabled={disabled || !agents.length}>
        {currentAgentId ? "Reassign" : "Assign"}
      </Button>
      {!agents.length && <p className="text-xs text-ink-500">No agent is set up to receive inquiries yet (active + 2FA enrolled).</p>}
      {currentAgentId && (
        <Button type="submit" formAction={release} variant="ghost" size="sm" block loading={releasing} loadingLabel="Releasing" disabled={disabled}>
          Release to queue
        </Button>
      )}
      {releaseState && !releaseState.ok && <p className="text-xs font-semibold text-[var(--color-danger)]">{releaseState.message}</p>}
    </form>
  );
}

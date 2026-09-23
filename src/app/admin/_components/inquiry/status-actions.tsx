"use client";

import { useActionState, useState, useTransition } from "react";
import { Ban, CheckCheck, Hand, PhoneOutgoing, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { InquiryStatus } from "@/lib/types";
import { LOST_REASON_LABELS, LOST_REASONS, STATUS_LABELS, TRANSITIONS } from "@/server/domain/inquiry-state";
import { claimInquiry, convertInquiry, logInquiryContact, markInquirySpam, transitionInquiry } from "@/app/admin/_actions/inquiries";
import type { ActionResult } from "@/app/admin/_actions/result";

const FIELD =
  "w-full rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sun-300 disabled:opacity-60";

/**
 * Status controls for one inquiry. Only legal moves from
 * `TRANSITIONS[status]` are rendered; `won` goes through the convert form,
 * `lost` and `spam` open reason panels. The service re-validates every move.
 */

const FORWARD_LABELS: Partial<Record<InquiryStatus, string>> = {
  contacted: "Mark contacted",
  quoted: "Mark quoted",
  negotiating: "Negotiating",
  payment_pending: "Payment link sent",
  assigned: "Back to assigned",
  new: "Not spam — reopen",
};

function ErrorAlert({ state }: { state: ActionResult<unknown> | null }) {
  if (!state || state.ok) return null;
  return (
    <Alert tone="danger" title={state.message}>
      {Object.values(state.fields ?? {})[0] ?? state.recovery}
    </Alert>
  );
}

/* ---------------------------------------------------------------- claim */

export function ClaimButton({ inquiryId, size = "md" }: { inquiryId: string; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="primary"
        size={size}
        loading={pending}
        loadingLabel="Claiming"
        onClick={() => start(async () => setResult(await claimInquiry(inquiryId)))}
      >
        <Hand className="h-4 w-4" /> Claim this inquiry
      </Button>
      <ErrorAlert state={result} />
    </div>
  );
}

/* --------------------------------------------------------- log contact */

export function LogContactButton({ inquiryId, status, disabled }: { inquiryId: string; status: InquiryStatus; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<ActionResult<{ status: string }> | null, FormData>(async (_prev, fd) => {
    const r = await logInquiryContact({ id: inquiryId, note: String(fd.get("note") ?? "") || undefined });
    if (r.ok) setOpen(false);
    return r;
  }, null);
  const movesToContacted = status === "new" || status === "assigned";

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" block onClick={() => setOpen(true)} disabled={disabled}>
        <PhoneOutgoing className="h-4 w-4" /> Log contact
      </Button>
    );
  }
  return (
    <form action={submit} className="space-y-2 rounded-[var(--radius-control)] bg-shell/70 p-3">
      <p className="text-xs text-ink-600">
        {movesToContacted ? "This sets first response and moves the inquiry to Contacted." : "Resets the follow-up clock. Status stays the same."}
      </p>
      <textarea name="note" rows={2} maxLength={2000} placeholder="What was said (optional)" className={FIELD} disabled={pending} />
      <ErrorAlert state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary" size="sm" loading={pending} loadingLabel="Logging">
          Log it
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------- transitions */

export function StatusActions({
  inquiryId,
  status,
  canUpdate,
  canReopen,
  canMarkSpam,
}: {
  inquiryId: string;
  status: InquiryStatus;
  canUpdate: boolean;
  canReopen: boolean;
  canMarkSpam: boolean;
}) {
  const [panel, setPanel] = useState<"lost" | "spam" | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<InquiryStatus | null>(null);
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);

  const legal = TRANSITIONS[status] ?? [];
  const reopening = status === "lost" || status === "spam";
  const forward = legal.filter((to) => to !== status && to !== "won" && to !== "lost" && to !== "spam" && !(status === "new" && to === "assigned"));
  const canLose = legal.includes("lost") && canUpdate;
  const canSpam = legal.includes("spam") && canMarkSpam;
  const allowedForward = reopening ? canReopen : canUpdate;

  const move = (to: InquiryStatus) => {
    setBusy(to);
    start(async () => {
      setResult(await transitionInquiry({ id: inquiryId, to }));
      setBusy(null);
    });
  };

  if (status === "won") {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-success)]">
        <CheckCheck className="h-4 w-4" /> Won — order created. Nothing more to do here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {forward.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {forward.map((to) => (
            <Button
              key={to}
              type="button"
              variant={to === "assigned" || to === "new" ? "outline" : "secondary"}
              size="sm"
              disabled={!allowedForward || pending}
              loading={pending && busy === to}
              loadingLabel="Saving"
              onClick={() => move(to)}
              title={!allowedForward ? (reopening ? "Reopening is a lead action" : "Only the assigned agent or a lead can do this") : undefined}
            >
              {(to === "assigned" || to === "new") && <Undo2 className="h-3.5 w-3.5" />}
              {FORWARD_LABELS[to] ?? `Move to ${STATUS_LABELS[to]}`}
            </Button>
          ))}
        </div>
      )}
      {reopening && !canReopen && <p className="text-xs text-ink-500">Reopening a {STATUS_LABELS[status].toLowerCase()} inquiry needs a lead.</p>}

      {(canLose || canSpam) && (
        <div className="flex flex-wrap gap-2">
          {canLose && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(panel === "lost" ? null : "lost")} aria-expanded={panel === "lost"} disabled={pending}>
              Mark lost
            </Button>
          )}
          {canSpam && (
            <Button type="button" variant="ghost" size="sm" className="text-[var(--color-danger)]" onClick={() => setPanel(panel === "spam" ? null : "spam")} aria-expanded={panel === "spam"} disabled={pending}>
              <Ban className="h-3.5 w-3.5" /> Mark spam
            </Button>
          )}
        </div>
      )}

      <ErrorAlert state={result} />
      {panel === "lost" && <MarkLostPanel inquiryId={inquiryId} onDone={() => setPanel(null)} />}
      {panel === "spam" && <MarkSpamPanel inquiryId={inquiryId} onDone={() => setPanel(null)} />}
    </div>
  );
}

function MarkLostPanel({ inquiryId, onDone }: { inquiryId: string; onDone: () => void }) {
  const [state, submit, pending] = useActionState<ActionResult<{ status: string }> | null, FormData>(async (_prev, fd) => {
    const r = await transitionInquiry({
      id: inquiryId,
      to: "lost",
      reason: String(fd.get("reason") ?? ""),
      note: String(fd.get("note") ?? "") || undefined,
    });
    if (r.ok) onDone();
    return r;
  }, null);
  return (
    <form action={submit} className="space-y-2 rounded-[var(--radius-control)] bg-shell/70 p-3">
      <label className="block text-xs font-semibold text-ink-700">
        Why did we lose it?
        <select name="reason" required defaultValue="" className={cn(FIELD, "mt-1")} disabled={pending}>
          <option value="" disabled>
            Pick a reason
          </option>
          {LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {LOST_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <textarea name="note" rows={2} maxLength={2000} placeholder="Anything worth remembering (optional)" className={FIELD} disabled={pending} />
      <ErrorAlert state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" size="sm" loading={pending} loadingLabel="Saving">
          Mark lost
        </Button>
      </div>
    </form>
  );
}

function MarkSpamPanel({ inquiryId, onDone }: { inquiryId: string; onDone: () => void }) {
  const [state, submit, pending] = useActionState<ActionResult<{ status: string }> | null, FormData>(async (_prev, fd) => {
    const r = await markInquirySpam({
      id: inquiryId,
      reason: String(fd.get("reason") ?? ""),
      suppress: fd.get("suppress") === "on",
    });
    if (r.ok) onDone();
    return r;
  }, null);
  return (
    <form action={submit} className="space-y-2 rounded-[var(--radius-control)] bg-shell/70 p-3">
      <label className="block text-xs font-semibold text-ink-700">
        Why is it spam?
        <input name="reason" type="text" required maxLength={200} placeholder="e.g. wrong number, gibberish, test submission" className={cn(FIELD, "mt-1")} disabled={pending} />
      </label>
      <label className="inline-flex min-h-11 items-center gap-2 text-sm">
        <input name="suppress" type="checkbox" className="h-4 w-4 accent-[var(--color-sun-500)]" disabled={pending} />
        Also suppress this number (future submissions are rejected)
      </label>
      <ErrorAlert state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" size="sm" loading={pending} loadingLabel="Saving">
          Mark spam
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- convert */

const METHODS = [
  { value: "razorpay_link", label: "Razorpay payment link" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export function ConvertForm({
  inquiryId,
  status,
  defaultAmountInr,
  blockers,
  existingOrderReference,
}: {
  inquiryId: string;
  status: InquiryStatus;
  defaultAmountInr: number;
  /** Human reasons conversion is not possible yet; empty means go. */
  blockers: string[];
  existingOrderReference?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<ActionResult<{ orderReference: string; orderId: string }> | null, FormData>(async (_prev, fd) => {
    const amount = String(fd.get("amountPaidInr") ?? "").trim();
    return convertInquiry({
      id: inquiryId,
      paymentLinkUrl: String(fd.get("paymentLinkUrl") ?? "").trim(),
      paymentLinkId: String(fd.get("paymentLinkId") ?? "").trim() || undefined,
      gatewayPaymentId: String(fd.get("gatewayPaymentId") ?? "").trim() || undefined,
      amountPaidInr: amount === "" ? undefined : Number(amount),
      method: String(fd.get("method") ?? "") || undefined,
      paidAt: String(fd.get("paidAt") ?? "").trim() || undefined,
      note: String(fd.get("note") ?? "").trim() || undefined,
    });
  }, null);

  if (status === "won" || state?.ok) {
    const ref = state?.ok ? state.data.orderReference : existingOrderReference;
    return (
      <Alert tone="success" title={`Order ${ref ?? "created"}`}>
        The order is in the fulfilment pipeline. The customer has been sent the confirmation.
      </Alert>
    );
  }

  const canConvert = TRANSITIONS[status]?.includes("won") ?? false;
  const allBlockers = [...(canConvert ? [] : [`Only a quoted, negotiating or payment-pending inquiry can be converted (this one is ${STATUS_LABELS[status].toLowerCase()})`]), ...blockers];

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="primary" size="md" block disabled={allBlockers.length > 0} onClick={() => setOpen(true)}>
          <CheckCheck className="h-4 w-4" /> Convert to order
        </Button>
        {allBlockers.length > 0 && (
          <ul className="space-y-0.5 text-xs text-ink-600">
            {allBlockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3 rounded-[var(--radius-control)] bg-shell/70 p-3">
      <p className="text-xs text-ink-600">Record the payment the customer already made. This creates the order and marks the inquiry won.</p>
      <label className="block text-xs font-semibold text-ink-700">
        Payment link URL
        <input name="paymentLinkUrl" type="url" maxLength={500} placeholder="https://rzp.io/…" className={cn(FIELD, "mt-1")} disabled={pending} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-ink-700">
          Payment link ID
          <input name="paymentLinkId" type="text" maxLength={100} placeholder="plink_…" className={cn(FIELD, "mt-1")} disabled={pending} />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Razorpay payment ID
          <input name="gatewayPaymentId" type="text" maxLength={100} placeholder="pay_…" className={cn(FIELD, "mt-1")} disabled={pending} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-ink-700">
          Amount paid (INR)
          <input name="amountPaidInr" type="number" min={0} step={1} inputMode="numeric" defaultValue={defaultAmountInr} className={cn(FIELD, "mt-1 tnum")} disabled={pending} />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Method
          <select name="method" defaultValue="razorpay_link" className={cn(FIELD, "mt-1")} disabled={pending}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-ink-700">
        Paid at (leave blank for now)
        <input name="paidAt" type="datetime-local" className={cn(FIELD, "mt-1")} disabled={pending} />
      </label>
      <textarea name="note" rows={2} maxLength={2000} placeholder="Note for the timeline (optional)" className={FIELD} disabled={pending} />
      <ErrorAlert state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={pending} loadingLabel="Creating order">
          Create order
        </Button>
      </div>
    </form>
  );
}

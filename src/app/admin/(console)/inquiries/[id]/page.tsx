import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";
import { requirePage } from "@/app/admin/_lib/guard";
import { Panel } from "@/app/admin/_components/ui";
import { inquiryService } from "@/server/services/inquiry.service";
import { adminRepo } from "@/server/repositories/admin.repo";
import { TERMINAL } from "@/server/domain/inquiry-state";
import { hasPermission } from "@/server/lib/actor";
import { AppError } from "@/server/lib/errors";
import { paxLabel } from "@/lib/utils";
import { Alert, Breadcrumbs, Card } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { StatusPill, AgentAvatar } from "@/app/admin/_components/inquiry/status-pill";
import { SlaCountdown, RelativeTime } from "@/app/admin/_components/inquiry/sla-countdown";
import { ItemEditor } from "@/app/admin/_components/inquiry/item-editor";
import { AssignPicker, type RoutableAgent } from "@/app/admin/_components/inquiry/assign-picker";
import { ClaimButton, ConvertForm, LogContactButton, StatusActions } from "@/app/admin/_components/inquiry/status-actions";
import { NotesComposer } from "@/app/admin/_components/inquiry/notes";
import { Timeline } from "@/app/admin/_components/inquiry/timeline";
import { NotificationsList } from "@/app/admin/_components/inquiry/notifications";
import { BUDGET_LABELS, CONSOLE_TZ_LABEL, DIETARY_LABELS, fmtBoth, fmtDateRange, fmtDateTime, fmtMoney, SOURCE_LABELS, waLink } from "@/app/admin/_components/inquiry/format";

/**
 * Inquiry detail — the "customer 360-lite" (§09 §3.5, §17 §7.2 step 10):
 * everything an agent needs in one screen before they reply. Left column is
 * what the customer asked for and who they are; right column is what the
 * agent does about it. Layout pattern: two-pane record view with a sticky
 * action rail on desktop, stacked on mobile; adapted to OUTLYY tokens, not
 * taken from a specific 21st.dev component.
 *
 * Customer text (name, requests, notes) is rendered as React text only.
 */

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs font-bold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // No page-level permission: the service applies view_own / view_all per inquiry.
  const { actor, user } = await requirePage();
  const { id } = await params;

  let inquiry;
  try {
    inquiry = await inquiryService.get(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError) {
      return (
        <div className="space-y-4">
          <Breadcrumbs items={[{ label: "Inquiries", href: "/admin/inquiries" }, { label: "Inquiry" }]} />
          <Alert tone="danger" title={e.code === "FORBIDDEN" ? "This inquiry is assigned to someone else" : e.message}>
            {e.code === "FORBIDDEN" ? "You can open inquiries assigned to you. Ask a lead to reassign it if it should be yours." : e.recovery}
          </Alert>
        </div>
      );
    }
    throw e;
  }

  const has = (p: Parameters<typeof hasPermission>[1]) => hasPermission(actor, p);
  const mine = inquiry.assignedAgent?.id === actor.id;
  const terminal = TERMINAL.has(inquiry.status);
  const can = {
    update: has("inquiries.update") && (has("inquiries.assign") || mine),
    claim: has("inquiries.claim") && !inquiry.assignedAgent && !terminal,
    assign: has("inquiries.assign") && !terminal,
    reopen: has("inquiries.assign") && has("inquiries.update"),
    spam: has("inquiries.mark_spam") && inquiry.status !== "won",
    convert: has("inquiries.convert") && has("inquiries.update") && (has("inquiries.assign") || mine),
    resend: has("notifications.resend"),
    pii: has("customers.view_pii"),
  };

  let agents: RoutableAgent[] = [];
  if (can.assign) {
    agents = (await adminRepo.listRoutable()).map((u) => {
      const name = u.whatsappDisplayName?.includes(" ") ? u.whatsappDisplayName : u.fullName;
      return {
        id: u.id,
        name,
        initials: name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join(""),
        shift: u.availability?.shift ?? "IST",
        openCount: u.openCount,
        availability: u.availability?.status ?? "available",
        title: u.availability?.title ?? undefined,
      };
    });
  }

  const agentNames: Record<string, string> = {};
  for (const a of agents) agentNames[a.id] = a.name;
  if (inquiry.assignedAgent) agentNames[inquiry.assignedAgent.id] = inquiry.assignedAgent.name;
  for (const h of inquiry.history) if (h.assignedAgent) agentNames[h.assignedAgent.id] = h.assignedAgent.name;
  if (actor.id) agentNames[actor.id] = user.whatsappDisplayName ?? user.fullName;

  const serverNow = Date.now();
  const confirmedSumInr = inquiry.items.reduce((s, i) => s + (i.confirmedTotal?.inr ?? 0), 0);
  const blockers: string[] = [];
  if (!inquiry.items.length) blockers.push("Add at least one item first");
  const noDate = inquiry.items.filter((i) => !i.date);
  if (noDate.length) blockers.push(`Needs a service date: ${noDate.map((i) => i.title).join(", ")}`);
  const noPrice = inquiry.items.filter((i) => !i.confirmedTotal);
  if (noPrice.length) blockers.push(`Confirm the price on: ${noPrice.map((i) => i.title).join(", ")}`);
  if (!can.convert && has("inquiries.convert")) blockers.push("Only the assigned agent or a lead can convert");
  if (!has("inquiries.convert")) blockers.push("You do not have permission to convert inquiries");

  const agentFirst = (user.whatsappDisplayName ?? user.fullName).split(/\s+/)[0];
  const leadFirst = inquiry.leadName.split(/\s+/)[0];
  const waText = `Hi ${leadFirst}, ${agentFirst} here from OUTLYY about your inquiry ${inquiry.reference}.`;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Inquiries", href: "/admin/inquiries" }, { label: inquiry.reference }]} />

      {/* Header */}
      <Card as="section" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tnum text-ink-900">{inquiry.reference}</h1>
              <StatusPill status={inquiry.status} />
              <Badge tone="neutral" size="sm">
                {SOURCE_LABELS[inquiry.source]}
              </Badge>
              {inquiry.currency === "AED" && (
                <Badge tone="neutral" size="sm">
                  AED customer
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-600">
              <span className="font-semibold text-ink-900">{inquiry.leadName}</span> · {inquiry.leadPhoneMasked} · submitted{" "}
              <RelativeTime iso={inquiry.createdAt} serverNow={serverNow} /> ({fmtDateTime(inquiry.createdAt)} {CONSOLE_TZ_LABEL})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-2xs font-bold uppercase tracking-wider text-ink-500">{inquiry.firstResponseAt ? "First response" : "Reply by"}</p>
              <SlaCountdown
                status={inquiry.status}
                slaDueAt={inquiry.slaDueAt}
                slaBreachedAt={inquiry.slaBreachedAt}
                firstResponseAt={inquiry.firstResponseAt}
                createdAt={inquiry.createdAt}
                serverNow={serverNow}
              />
              {!inquiry.firstResponseAt && inquiry.slaDueAt && <p className="mt-0.5 text-xs text-ink-500 tnum">{fmtDateTime(inquiry.slaDueAt)} {CONSOLE_TZ_LABEL}</p>}
            </div>
            <div className="flex items-center gap-2">
              <AgentAvatar initials={inquiry.assignedAgent?.initials} name={inquiry.assignedAgent?.name} />
              <div className="text-sm">
                <p className="font-semibold text-ink-900">{inquiry.assignedAgent ? inquiry.assignedAgent.name : "Unassigned"}</p>
                <p className="text-xs text-ink-500">{inquiry.assignedAgent ? `${inquiry.assignedAgent.shift} shift` : "Nobody owns this yet"}</p>
              </div>
            </div>
            {can.claim && <ClaimButton inquiryId={inquiry.id} />}
          </div>
        </div>
        {inquiry.escalatedAt && !inquiry.firstResponseAt && (
          <Alert tone="danger" className="mt-3" title="SLA breached — escalated">
            The customer was told we are still checking. Reply now, then log the contact.
          </Alert>
        )}
        {inquiry.spamSignals && Object.keys(inquiry.spamSignals).length > 0 && inquiry.status === "new" && (
          <Alert tone="warning" className="mt-3" title="Held for review">
            Spam signals: {Object.keys(inquiry.spamSignals).join(", ")}. Check before replying.
          </Alert>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Left column: what they asked for, who they are */}
        <div className="space-y-4">
          <Panel
            title={`Items (${inquiry.items.length})`}
            actions={
              <span className="text-xs text-ink-600 tnum" title={fmtBoth(inquiry.indicativeTotal)}>
                Customer saw {fmtMoney(inquiry.indicativeTotal, inquiry.currency)}
                {confirmedSumInr > 0 && ` · confirmed ₹${confirmedSumInr.toLocaleString("en-IN")}`}
              </span>
            }
          >
            {inquiry.items.length ? (
              <ul className="space-y-3">
                {inquiry.items.map((item) => (
                  <ItemEditor key={item.id} inquiryId={inquiry.id} item={item} currency={inquiry.currency} canEdit={can.update && !terminal} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">No items on this inquiry.</p>
            )}
          </Panel>

          <Panel title="Trip details">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Dates">{fmtDateRange(inquiry.travelDateFrom, inquiry.travelDateTo, inquiry.datesFlexible)}</Field>
              <Field label="Guests">{inquiry.pax ? paxLabel(inquiry.pax) : `${inquiry.guests} guest${inquiry.guests === 1 ? "" : "s"}`}</Field>
              <Field label="Dietary">{inquiry.dietary ? DIETARY_LABELS[inquiry.dietary] : "—"}</Field>
              <Field label="Hotel / pickup">
                {inquiry.hotel ?? "—"}
                {inquiry.pickupZone ? <span className="text-ink-500"> · {inquiry.pickupZone}</span> : null}
              </Field>
              <Field label="Budget">{inquiry.budgetBand ? BUDGET_LABELS[inquiry.budgetBand] : "—"}</Field>
              <Field label="Prefers">{inquiry.channelPreference ?? (inquiry.whatsappConsent ? "WhatsApp" : "—")}</Field>
            </dl>
            {inquiry.specialRequests && (
              <div className="mt-3">
                <p className="text-2xs font-bold uppercase tracking-wider text-ink-500">Special requests</p>
                <p className="mt-1 whitespace-pre-wrap break-words rounded-[var(--radius-control)] bg-shell/70 p-3 text-sm leading-relaxed text-ink-800">{inquiry.specialRequests}</p>
              </div>
            )}
          </Panel>

          <Panel title="Contact">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Name">{inquiry.leadName}</Field>
                <Field label="WhatsApp">
                  <span className="tnum">{can.pii ? inquiry.leadPhone : inquiry.leadPhoneMasked}</span>
                  {!inquiry.whatsappConsent && <span className="ml-1 text-xs text-[var(--color-warning)]">no WhatsApp consent</span>}
                </Field>
                <Field label="Email">{inquiry.leadEmail ? (can.pii ? inquiry.leadEmail : "on file") : "—"}</Field>
                <Field label="Country code">{inquiry.countryCode}</Field>
              </dl>
              {can.pii && (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={waLink(inquiry.leadPhone, waText)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border-2 border-whatsapp bg-white px-4 text-sm font-semibold text-ink-900 shadow-[0_2px_0_var(--color-whatsapp-dark)] hover:bg-[#f2fdf6]"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp <ExternalLink className="h-3.5 w-3.5 text-ink-400" />
                  </a>
                  <a href={`tel:${inquiry.leadPhone}`} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-900 hover:bg-shell">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                  {inquiry.leadEmail && (
                    <a href={`mailto:${encodeURIComponent(inquiry.leadEmail)}?subject=${encodeURIComponent(`Your OUTLYY inquiry ${inquiry.reference}`)}`} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-900 hover:bg-shell">
                      <Mail className="h-4 w-4" /> Email
                    </a>
                  )}
                </div>
              )}
            </div>
            {inquiry.attribution && Object.keys(inquiry.attribution).length > 0 && (
              <p className="mt-3 text-xs text-ink-500">
                Came from{" "}
                {["utm_source", "utm_medium", "utm_campaign", "referrer", "landing"]
                  .filter((k) => typeof inquiry.attribution?.[k] === "string")
                  .map((k) => `${k.replace("utm_", "")}: ${String(inquiry.attribution?.[k]).slice(0, 60)}`)
                  .join(" · ") || "direct"}
              </p>
            )}
          </Panel>

          <Panel title="Activity">
            <Timeline events={inquiry.events} serverNow={serverNow} agentNames={agentNames} />
          </Panel>
        </div>

        {/* Right column: what the agent does about it */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel title="Status">
            <StatusActions inquiryId={inquiry.id} status={inquiry.status} canUpdate={can.update} canReopen={can.reopen} canMarkSpam={can.spam} />
            {inquiry.status === "lost" && inquiry.lostReason && (
              <p className="mt-3 text-xs text-ink-600">
                Lost: {inquiry.lostReason.replace(/_/g, " ")}
                {inquiry.lostAt ? ` · ${fmtDateTime(inquiry.lostAt)} ${CONSOLE_TZ_LABEL}` : ""}
              </p>
            )}
            {!terminal && can.update && (
              <div className="mt-3">
                <LogContactButton inquiryId={inquiry.id} status={inquiry.status} />
              </div>
            )}
            {inquiry.nextFollowupAt && !terminal && (
              <p className="mt-3 text-xs text-ink-500">
                Next automatic follow-up <RelativeTime iso={inquiry.nextFollowupAt} serverNow={serverNow} /> (stage {inquiry.followupStage + 1})
              </p>
            )}
          </Panel>

          {(has("inquiries.convert") || inquiry.status === "won") && (
            <Panel title="Convert to order">
              <ConvertForm
                inquiryId={inquiry.id}
                status={inquiry.status}
                defaultAmountInr={confirmedSumInr}
                blockers={blockers}
                existingOrderReference={inquiry.convertedOrderReference}
              />
            </Panel>
          )}

          {can.assign && (
            <Panel title="Assignment">
              <AssignPicker inquiryId={inquiry.id} agents={agents} currentAgentId={inquiry.assignedAgent?.id} />
            </Panel>
          )}

          <Panel title="Notes">
            {can.update ? <NotesComposer inquiryId={inquiry.id} /> : <p className="text-sm text-ink-500">Only the assigned agent or a lead can add notes.</p>}
          </Panel>

          <Panel title="Notifications">
            <NotificationsList inquiryId={inquiry.id} notifications={inquiry.notifications} canResend={can.resend} />
          </Panel>

          <Panel title="Same number, other inquiries">
            {inquiry.history.length ? (
              <ul className="divide-y divide-ink-100">
                {inquiry.history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/admin/inquiries/${h.id}`} className="font-bold tnum text-ink-900 hover:underline">
                        {h.reference}
                      </Link>
                      <p className="truncate text-xs text-ink-500">
                        {h.itemTitles[0] ?? "No items"} · <RelativeTime iso={h.createdAt} serverNow={serverNow} />
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-semibold tnum text-ink-700">{fmtMoney(h.indicativeTotal, h.currency)}</span>
                      <StatusPill status={h.status} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">First time we have heard from this number.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

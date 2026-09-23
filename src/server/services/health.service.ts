import "server-only";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { requirePermission, type Actor } from "../lib/actor";
import { settingsRepo } from "../repositories/settings.repo";
import { timeZoneLabel } from "../domain/sla";
import { settingsService } from "./settings.service";
import { SWEEP_HEARTBEAT_KEY } from "./inquiry.service";

/**
 * Operational health for the admin dashboard.
 *
 * Everything here is a failure that is otherwise *silent*: a cron that never
 * fires, an agent nobody can route to, an allowlist that swallows every
 * message, a category that keeps its activities off the storefront. Each one
 * had already happened in production-shaped data before this existed, and in
 * every case the console looked perfectly healthy.
 *
 * Read-only and cheap: five counts and one settings read.
 */

export type HealthSeverity = "danger" | "warning" | "info";

export interface HealthIssue {
  id: string;
  severity: HealthSeverity;
  title: string;
  detail: string;
  /** Where the operator goes to fix it, when the fix lives in the console. */
  href?: string;
  action?: string;
}

/** How stale the sweep heartbeat may get before we call it broken. Cron runs every 5 minutes. */
const SWEEP_STALE_MS = 20 * 60_000;
const ROUTABLE_ROLES = ["agent", "agent_lead", "ops", "admin"];

function ago(from: Date, now: Date): string {
  const mins = Math.round((now.getTime() - from.getTime()) / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export const healthService = {
  async check(actor: Actor, now = new Date()): Promise<HealthIssue[]> {
    requirePermission(actor, "inquiries.view_all");
    const e = env();
    const issues: HealthIssue[] = [];

    const [sla, heartbeat, staff, openOverdue, draftCategories] = await Promise.all([
      settingsService.sla(),
      settingsRepo.get<{ ranAt?: string } | null>(SWEEP_HEARTBEAT_KEY, null),
      prisma.adminUser.findMany({
        where: { deletedAt: null, status: "active", roles: { some: { role: { code: { in: ROUTABLE_ROLES } } } } },
        select: { id: true, fullName: true, totpEnabled: true, availability: { select: { shift: true, status: true } } },
      }),
      prisma.inquiry.count({ where: { status: { in: ["new", "assigned"] }, firstResponseAt: null, slaBreachedAt: null, slaDueAt: { lt: now } } }),
      prisma.category.findMany({ where: { deletedAt: null, status: { not: "published" } }, select: { slug: true } }),
    ]);

    /* 1. The sweep — SLA breaches, the follow-up ladder, auto-lost and notification retries all hang off it. */
    const ranAt = heartbeat?.ranAt ? new Date(heartbeat.ranAt) : null;
    if (!ranAt || Number.isNaN(ranAt.getTime())) {
      issues.push({
        id: "sweep.never",
        severity: "danger",
        title: "The inquiry sweep has never run",
        detail: `SLA breach escalation, the follow-up ladder, auto-lost and notification retries all depend on it.${openOverdue > 0 ? ` ${openOverdue} inquir${openOverdue === 1 ? "y is" : "ies are"} already past the promise with no breach recorded.` : ""} Set CRON_SECRET in the deployment and confirm the vercel.json cron is live.`,
      });
    } else if (now.getTime() - ranAt.getTime() > SWEEP_STALE_MS) {
      issues.push({
        id: "sweep.stale",
        severity: "danger",
        title: `The inquiry sweep last ran ${ago(ranAt, now)}`,
        detail: "It is scheduled every 5 minutes. Until it runs, no SLA breach is escalated and no follow-up is sent.",
      });
    }

    /* 2. Staff who look active but cannot receive a lead. Routing requires 2FA enrolment. */
    const blocked = staff.filter((u) => !u.totpEnabled);
    const routable = staff.filter((u) => u.totpEnabled);
    if (blocked.length) {
      issues.push({
        id: "routing.no_2fa",
        severity: "warning",
        title: `${blocked.length} active ${blocked.length === 1 ? "user is" : "users are"} invisible to lead routing`,
        detail: `${blocked.map((u) => u.fullName).join(", ")} ${blocked.length === 1 ? "has" : "have"} not finished two-factor enrolment, so ${blocked.length === 1 ? "they are" : "they are"} never assigned an inquiry and never appear in the assign picker.`,
        href: "/admin/users",
        action: "Open Users",
      });
    }
    if (!routable.length) {
      issues.push({
        id: "routing.none",
        severity: "danger",
        title: "No agent can be routed to",
        detail: "Every new inquiry will land unassigned. An agent needs an active account, a routable role and two-factor enrolment.",
        href: "/admin/users",
        action: "Open Users",
      });
    } else {
      /* 3. The shift that matches the SLA timezone — the UAE-shift routing rule is dead without it. */
      const wantedShift = sla.timeZone === "Asia/Dubai" ? "GST" : "IST";
      if (!routable.some((u) => u.availability?.shift === wantedShift)) {
        issues.push({
          id: "routing.shift",
          severity: "warning",
          title: `No routable agent is on the ${wantedShift} shift`,
          detail: `Business hours run on ${timeZoneLabel(sla.timeZone)}, so the "UAE resident → UAE shift" routing rule can never match and every lead falls through to round-robin.`,
          href: "/admin/users",
          action: "Set a shift",
        });
      }
    }

    /* 4. Notifications that can never leave the building. */
    if (e.isNonProduction && e.recipientAllowlist.length === 0) {
      issues.push({
        id: "notifications.suppressed",
        severity: "warning",
        title: "Every notification is being suppressed",
        detail: "This is a non-production environment with an empty NOTIFICATION_RECIPIENT_ALLOWLIST, so no acknowledgement, follow-up or ops alert reaches anyone. Add your own number and email to test the send path end to end.",
      });
    }

    /* 5. Draft categories quietly keeping published activities off the storefront. */
    if (draftCategories.length) {
      const slugs = draftCategories.map((c) => c.slug);
      const orphans = await prisma.product.count({ where: { deletedAt: null, categorySlug: { in: slugs } } });
      if (orphans > 0) {
        issues.push({
          id: "catalogue.draft_categories",
          severity: "warning",
          title: `${draftCategories.length} categor${draftCategories.length === 1 ? "y is" : "ies are"} not published`,
          detail: `${orphans} activit${orphans === 1 ? "y has" : "ies have"} no category page to sit on: ${slugs.join(", ")}.`,
          href: "/admin/categories",
          action: "Publish them",
        });
      }
    }

    return issues;
  },
};

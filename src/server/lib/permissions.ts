/**
 * Permission matrix — docs/backend/09-agent-console.md §4, extended with the
 * inquiry pipeline permissions Inquiry Mode adds. Roles are bundles; services
 * check permissions, never roles (§13.3).
 */

export const PERMISSIONS = [
  // Inquiry pipeline (§17)
  "inquiries.view_own",
  "inquiries.view_all",
  "inquiries.claim",
  "inquiries.assign",
  "inquiries.update",
  "inquiries.mark_spam",
  "inquiries.convert",
  "inquiries.export",
  // Conversations / quotes (§09) — retained names, mostly future
  "conversations.view_own",
  "conversations.view_all",
  "conversations.assign",
  "quotes.create",
  "quotes.view_margin",
  "pricing.override",
  "pricing.override_floor",
  // Orders
  "orders.create",
  "orders.view_all",
  "orders.amend",
  "orders.cancel",
  "payments.record",
  "refunds.initiate",
  "refunds.goodwill",
  "vouchers.resend",
  // Customers
  "customers.view_pii",
  "customers.export",
  // Catalogue
  "products.edit",
  "products.publish",
  "products.delete",
  "categories.edit",
  "imports.run",
  "pricing.edit",
  "suppliers.manage",
  // Ops
  "notifications.resend",
  "reports.view",
  "reports.financial",
  "analytics.view",
  "settings.edit",
  "users.manage",
  "audit.view",
  "privacy.anonymise",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_CODES = ["admin", "ops", "agent_lead", "agent", "finance", "content", "readonly"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

const ALL = [...PERMISSIONS] as Permission[];

export const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  admin: ALL,
  ops: [
    "inquiries.view_own", "inquiries.view_all", "inquiries.claim", "inquiries.assign", "inquiries.update",
    "inquiries.mark_spam", "inquiries.convert",
    "conversations.view_own", "conversations.view_all", "conversations.assign",
    "quotes.create", "quotes.view_margin", "pricing.override",
    "orders.create", "orders.view_all", "orders.amend", "orders.cancel", "payments.record",
    "refunds.initiate", "refunds.goodwill", "vouchers.resend",
    "customers.view_pii", "products.edit", "products.publish", "products.delete", "categories.edit", "imports.run",
    "pricing.edit", "suppliers.manage",
    "notifications.resend", "reports.view", "analytics.view", "audit.view",
  ],
  agent_lead: [
    "inquiries.view_own", "inquiries.view_all", "inquiries.claim", "inquiries.assign", "inquiries.update",
    "inquiries.mark_spam", "inquiries.convert",
    "conversations.view_own", "conversations.view_all", "conversations.assign",
    "quotes.create", "quotes.view_margin", "pricing.override", "pricing.override_floor",
    "orders.create", "orders.view_all", "orders.amend", "orders.cancel", "payments.record",
    "refunds.initiate", "vouchers.resend", "customers.view_pii", "notifications.resend", "reports.view", "analytics.view",
  ],
  agent: [
    "inquiries.view_own", "inquiries.view_all", "inquiries.claim", "inquiries.update",
    "inquiries.mark_spam", "inquiries.convert",
    "conversations.view_own", "quotes.create", "quotes.view_margin",
    "orders.create", "orders.view_all", "orders.amend", "payments.record", "vouchers.resend",
    "customers.view_pii", "notifications.resend",
  ],
  finance: [
    "inquiries.view_all", "quotes.view_margin", "orders.view_all", "payments.record",
    "refunds.initiate", "refunds.goodwill", "customers.view_pii", "customers.export",
    "pricing.edit", "reports.view", "reports.financial", "analytics.view", "audit.view",
  ],
  content: ["products.edit", "categories.edit", "imports.run"],
  readonly: ["inquiries.view_all", "conversations.view_all", "orders.view_all", "reports.view", "reports.financial", "analytics.view"],
};

export const ROLE_NAMES: Record<RoleCode, string> = {
  admin: "Administrator",
  ops: "Operations",
  agent_lead: "Agent lead",
  agent: "Agent",
  finance: "Finance",
  content: "Content",
  readonly: "Read-only",
};

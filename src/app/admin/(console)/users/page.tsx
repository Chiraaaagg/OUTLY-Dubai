import { ROLE_CODES, ROLE_NAMES } from "@/server/lib/permissions";
import { authService } from "@/server/services/auth.service";
import { requirePage } from "../../_lib/guard";
import { PageHeader } from "../../_components/ui";
import { UsersClient, type UserRow } from "./users-client";

/**
 * /admin/users — staff accounts (§10 §2.13). Mutations go through the Server
 * Actions in `_actions/users.ts`; the list comes from `authService.listUsers`.
 *
 * The table also answers the question the console used to hide: can this
 * person actually be given a lead? Routing needs an active account, a
 * routable role AND finished two-factor enrolment, so an "active" agent who
 * never scanned the QR code is silently skipped forever.
 */
export const dynamic = "force-dynamic";

/** Roles `adminRepo.listRoutable()` will consider — keep in step with it. */
const ROUTABLE_ROLES = ["agent", "agent_lead", "ops", "admin"];

export default async function AdminUsersPage() {
  const { actor } = await requirePage("users.manage");
  const users = await authService.listUsers(actor);
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    status: u.status,
    totpEnabled: u.totpEnabled,
    whatsappDisplayName: u.whatsappDisplayName,
    photoUrl: u.photoUrl,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    roles: u.roles,
    availability: u.availability,
    routable: u.status === "active" && u.totpEnabled && u.roles.some((r) => ROUTABLE_ROLES.includes(r)),
  }));
  const roleOptions = ROLE_CODES.map((code) => ({ code, label: ROLE_NAMES[code] }));

  return (
    <>
      <PageHeader title="Users" sub="Staff accounts, roles and agent availability. Two-factor is mandatory; a new user enrols on first sign-in." />
      <UsersClient users={rows} roleOptions={roleOptions} />
    </>
  );
}

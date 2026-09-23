"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { createUserAction, resetCredentialsAction, updateUserAction, type CreateUserResult, type ResetCredentialsResult, type UpdateUserResult } from "../../_actions/users";
import { DataTable, FormField, INPUT_CLASS, StatusPill, fmtDateTime, type DataColumn } from "../../_components/ui";

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  status: "active" | "suspended";
  totpEnabled: boolean;
  whatsappDisplayName: string | null;
  photoUrl: string | null;
  lastLoginAt: string | null;
  roles: string[];
  /** Can this account actually receive a routed inquiry? */
  routable: boolean;
  availability: {
    status: "available" | "busy" | "away" | "offline";
    maxConcurrent: number;
    skills: string[];
    languages: string[];
    shift: string;
    title: string | null;
  } | null;
}

interface RoleOption {
  code: string;
  label: string;
}

const AVAILABILITY_TONE = { available: "success", busy: "warning", away: "neutral", offline: "neutral" } as const;

/** Why an account will never be handed an inquiry — shown on the "not routable" pill. */
function reasonNotRoutable(u: UserRow): string {
  if (u.status !== "active") return "The account is suspended.";
  if (!u.totpEnabled) return "Two-factor enrolment is not finished, so lead routing and the assign picker skip this user.";
  return "No role that receives inquiries (agent, agent lead, ops or admin).";
}

export function UsersClient({ users, roleOptions }: { users: UserRow[]; roleOptions: RoleOption[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const roleLabel = (code: string) => roleOptions.find((r) => r.code === code)?.label ?? code;

  const columns: DataColumn<UserRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (u) => (
        <div>
          <p className="font-semibold text-ink-900">{u.fullName}</p>
          <p className="text-xs text-ink-500">{u.email}</p>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <StatusPill key={r} tone={r === "admin" ? "accent" : "neutral"}>
              {roleLabel(r)}
            </StatusPill>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={u.status === "active" ? "success" : "danger"}>{u.status}</StatusPill>
          <StatusPill tone={u.totpEnabled ? "info" : "warning"}>{u.totpEnabled ? "2FA on" : "2FA pending"}</StatusPill>
          {!u.routable && (
            <StatusPill tone="danger" className="cursor-help" title={reasonNotRoutable(u)}>
              not routable
            </StatusPill>
          )}
        </div>
      ),
    },
    {
      key: "availability",
      header: "Availability",
      cell: (u) =>
        u.availability ? (
          <div className="space-y-0.5">
            <StatusPill tone={AVAILABILITY_TONE[u.availability.status]}>{u.availability.status}</StatusPill>
            <p className="text-xs text-ink-500">
              {u.availability.shift} · max {u.availability.maxConcurrent}
              {u.availability.languages.length ? ` · ${u.availability.languages.join(", ")}` : ""}
            </p>
          </div>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    { key: "lastLogin", header: "Last sign-in", cell: (u) => <span className="tnum text-ink-700">{fmtDateTime(u.lastLoginAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
            Reset
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" size="md" onClick={() => setCreating(true)}>
          New user
        </Button>
      </div>
      <DataTable columns={columns} rows={users} rowKey={(u) => u.id} caption="Staff accounts" empty="No users yet." />

      <Sheet open={creating} onClose={() => setCreating(false)} title="New user" description="A one-time password is shown once after saving. Hand it over securely; they set up two-factor on first sign-in." variant="drawer">
        <CreateUserForm roleOptions={roleOptions} onDone={() => setCreating(false)} />
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.fullName}` : "Edit user"} variant="drawer">
        {editing && <EditUserForm key={editing.id} user={editing} roleOptions={roleOptions} onDone={() => setEditing(null)} />}
      </Sheet>

      <Sheet open={resetting !== null} onClose={() => setResetting(null)} title={resetting ? `Reset credentials for ${resetting.fullName}` : "Reset credentials"} variant="dialog">
        {resetting && <ResetCredentialsForm key={resetting.id} user={resetting} />}
      </Sheet>
    </>
  );
}

/* --------------------------------------------------------------- forms */

function ErrorBanner({ state }: { state: { ok: false; message: string; recovery?: string } | null }) {
  if (!state) return null;
  return (
    <Alert tone="danger" title={state.message} className="mb-4">
      {state.recovery}
    </Alert>
  );
}

function RoleCheckboxes({ roleOptions, selected, error }: { roleOptions: RoleOption[]; selected?: string[]; error?: string }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold text-ink-800">Roles</legend>
      <div className="grid grid-cols-2 gap-1.5">
        {roleOptions.map((r) => (
          <label key={r.code} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-ink-200 px-3 text-sm hover:bg-shell/60">
            <input type="checkbox" name="roles" value={r.code} defaultChecked={selected?.includes(r.code)} className="h-4 w-4 accent-[var(--color-sun-500)]" />
            {r.label}
          </label>
        ))}
      </div>
      {error && (
        <p className="text-xs font-semibold text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function CreateUserForm({ roleOptions, onDone }: { roleOptions: RoleOption[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<CreateUserResult | null, FormData>(createUserAction, null);
  const fields = state && !state.ok ? state.fields ?? {} : {};

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="User created">
          Share this one-time password now — it is not shown again. They will set up two-factor on first sign-in.
        </Alert>
        <div className="rounded-[var(--radius-control)] border border-ink-200 bg-shell/60 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Temporary password</p>
          <p className="mt-1 break-all font-mono text-lg font-semibold text-ink-900">{state.data.temporaryPassword}</p>
        </div>
        <Button variant="secondary" block onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <ErrorBanner state={state && !state.ok ? state : null} />
      <FormField label="Full name" htmlFor="c-fullName" required error={fields.fullName}>
        <input id="c-fullName" name="fullName" required className={INPUT_CLASS} data-autofocus />
      </FormField>
      <FormField label="Work email" htmlFor="c-email" required error={fields.email}>
        <input id="c-email" name="email" type="email" required className={INPUT_CLASS} />
      </FormField>
      <RoleCheckboxes roleOptions={roleOptions} selected={["agent"]} error={fields.roles} />
      <FormField label="Customer-facing name" htmlFor="c-wa" hint="Shown to customers on the confirmation page. Defaults to the first name." error={fields.whatsappDisplayName}>
        <input id="c-wa" name="whatsappDisplayName" className={INPUT_CLASS} />
      </FormField>
      <FormField label="Title" htmlFor="c-title" hint='e.g. "Dubai trip specialist"' error={fields.title}>
        <input id="c-title" name="title" className={INPUT_CLASS} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Shift" htmlFor="c-shift" error={fields.shift}>
          <select id="c-shift" name="shift" defaultValue="IST" className={INPUT_CLASS}>
            <option value="IST">IST (India)</option>
            <option value="GST">GST (UAE)</option>
          </select>
        </FormField>
        <FormField label="Languages" htmlFor="c-languages" hint="Comma-separated" error={fields.languages}>
          <input id="c-languages" name="languages" defaultValue="English, Hindi" className={INPUT_CLASS} />
        </FormField>
      </div>
      <FormField label="Skills" htmlFor="c-skills" hint="Comma-separated: hindi, luxury, groups, abu-dhabi, uae-shift, senior" error={fields.skills}>
        <input id="c-skills" name="skills" className={INPUT_CLASS} />
      </FormField>
      <FormField label="Initial password" htmlFor="c-password" hint="Leave blank to generate a one-time password (recommended). Minimum 12 characters." error={fields.password}>
        <input id="c-password" name="password" type="password" autoComplete="new-password" className={INPUT_CLASS} />
      </FormField>
      <Button type="submit" block loading={pending} loadingLabel="Creating…">
        Create user
      </Button>
    </form>
  );
}

function EditUserForm({ user, roleOptions, onDone }: { user: UserRow; roleOptions: RoleOption[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<UpdateUserResult | null, FormData>(updateUserAction, null);
  const fields = state && !state.ok ? state.fields ?? {} : {};
  const a = user.availability;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="rolesEdited" value="true" />
      <ErrorBanner state={state && !state.ok ? state : null} />
      <FormField label="Full name" htmlFor="e-fullName" error={fields.fullName}>
        <input id="e-fullName" name="fullName" defaultValue={user.fullName} className={INPUT_CLASS} data-autofocus />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Account status" htmlFor="e-status" hint="Suspending signs them out everywhere." error={fields.status}>
          <select id="e-status" name="status" defaultValue={user.status} className={INPUT_CLASS}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </FormField>
        <FormField label="Availability" htmlFor="e-avail" error={fields.availabilityStatus}>
          <select id="e-avail" name="availabilityStatus" defaultValue={a?.status ?? "available"} className={INPUT_CLASS}>
            <option value="available">Available</option>
            <option value="busy">Busy</option>
            <option value="away">Away</option>
            <option value="offline">Offline</option>
          </select>
        </FormField>
      </div>
      <RoleCheckboxes roleOptions={roleOptions} selected={user.roles} error={fields.roles} />
      <FormField label="Customer-facing name" htmlFor="e-wa" error={fields.whatsappDisplayName}>
        <input id="e-wa" name="whatsappDisplayName" defaultValue={user.whatsappDisplayName ?? ""} className={INPUT_CLASS} />
      </FormField>
      <FormField label="Photo URL" htmlFor="e-photo" hint="Real photo of the agent (PRD §1)." error={fields.photoUrl}>
        <input id="e-photo" name="photoUrl" type="url" defaultValue={user.photoUrl ?? ""} className={INPUT_CLASS} />
      </FormField>
      <FormField label="Title" htmlFor="e-title" error={fields.title}>
        <input id="e-title" name="title" defaultValue={a?.title ?? ""} className={INPUT_CLASS} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Shift" htmlFor="e-shift" error={fields.shift}>
          <select id="e-shift" name="shift" defaultValue={a?.shift ?? "IST"} className={INPUT_CLASS}>
            <option value="IST">IST (India)</option>
            <option value="GST">GST (UAE)</option>
          </select>
        </FormField>
        <FormField label="Max concurrent" htmlFor="e-max" hint="Open inquiries at once" error={fields.maxConcurrent}>
          <input id="e-max" name="maxConcurrent" type="number" min={1} max={100} defaultValue={a?.maxConcurrent ?? 8} className={INPUT_CLASS} />
        </FormField>
      </div>
      <FormField label="Languages" htmlFor="e-languages" hint="Comma-separated" error={fields.languages}>
        <input id="e-languages" name="languages" defaultValue={a?.languages.join(", ") ?? ""} className={INPUT_CLASS} />
      </FormField>
      <FormField label="Skills" htmlFor="e-skills" hint="Comma-separated" error={fields.skills}>
        <input id="e-skills" name="skills" defaultValue={a?.skills.join(", ") ?? ""} className={INPUT_CLASS} />
      </FormField>
      <Button type="submit" block loading={pending} loadingLabel="Saving…">
        Save changes
      </Button>
    </form>
  );
}

function ResetCredentialsForm({ user }: { user: UserRow }) {
  const [state, action, pending] = useActionState<ResetCredentialsResult | null, FormData>(resetCredentialsAction, null);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Credentials reset">
          All their sessions were signed out. Share this one-time password now — it is not shown again.
          {state.data.resetTotp && " Two-factor was cleared; they enrol again on next sign-in."}
        </Alert>
        <div className="rounded-[var(--radius-control)] border border-ink-200 bg-shell/60 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Temporary password</p>
          <p className="mt-1 break-all font-mono text-lg font-semibold text-ink-900">{state.data.temporaryPassword}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={user.id} />
      <ErrorBanner state={state && !state.ok ? state : null} />
      <p className="text-sm text-ink-700">
        This sets a new one-time password for <strong>{user.email}</strong>, clears any lockout and signs them out of every device.
      </p>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-ink-200 px-3 text-sm">
        <input type="checkbox" name="resetTotp" className="h-4 w-4 accent-[var(--color-sun-500)]" />
        Also reset two-factor (lost phone)
      </label>
      <Button type="submit" variant="danger" block loading={pending} loadingLabel="Resetting…">
        Reset credentials
      </Button>
    </form>
  );
}

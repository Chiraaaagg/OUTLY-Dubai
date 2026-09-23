import { Errors } from "./errors";
import type { Permission } from "./permissions";

/**
 * Who is doing this? Every service mutation takes an `Actor` and calls
 * `requirePermission` itself (§13.3, AC-ADM-02: "enforced server-side in every
 * service call"). The UI may hide a button; the service refuses regardless.
 */

export type ActorKind = "admin" | "agent" | "system" | "customer";

export interface Actor {
  type: ActorKind;
  id?: string;
  email?: string;
  displayName?: string;
  roles: string[];
  permissions: ReadonlySet<string>;
  /** Request context for audit rows. */
  ipHash?: string;
  userAgent?: string;
}

export const SYSTEM_ACTOR: Actor = Object.freeze({
  type: "system",
  roles: ["system"],
  permissions: new Set<string>(["*"]),
});

export function customerActor(ctx?: { ipHash?: string; userAgent?: string }): Actor {
  return { type: "customer", roles: [], permissions: new Set(), ...ctx };
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has("*") || actor.permissions.has(permission);
}

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor, permission)) throw Errors.forbidden(permission);
}

export function requireAnyPermission(actor: Actor, permissions: Permission[]): void {
  if (!permissions.some((p) => hasPermission(actor, p))) throw Errors.forbidden(permissions.join(" | "));
}

/** Audit `actor_type` column value. */
export function actorType(actor: Actor): "admin" | "agent" | "system" | "customer" {
  return actor.type;
}

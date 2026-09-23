"use server";

import { revalidatePath } from "next/cache";
import { authService } from "@/server/services/auth.service";
import { parseWith } from "@/server/lib/http";
import { createUserSchema, updateUserSchema, userIdSchema } from "@/server/schemas/admin.schemas";
import { form, runAction, type ActionResult } from "./result";

/**
 * User administration (§10 §2.13). Each action re-resolves the session from
 * cookies and requires `users.manage` — the client never names the actor.
 * The service audits every mutation.
 */

export type CreateUserResult = ActionResult<{ id: string; temporaryPassword: string }>;
export type UpdateUserResult = ActionResult<{ id: string }>;
export type ResetCredentialsResult = ActionResult<{ id: string; temporaryPassword: string; resetTotp: boolean }>;

export async function createUserAction(_prev: CreateUserResult | null, fd: FormData): Promise<CreateUserResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("users.manage");
    const input = parseWith(createUserSchema, {
      email: form.str(fd, "email") ?? "",
      fullName: form.str(fd, "fullName") ?? "",
      password: form.str(fd, "password"),
      roles: form.all(fd, "roles"),
      whatsappDisplayName: form.str(fd, "whatsappDisplayName"),
      shift: form.str(fd, "shift"),
      languages: form.list(fd, "languages"),
      skills: form.list(fd, "skills"),
      title: form.str(fd, "title"),
    });
    const result = await authService.createUser(actor, input);
    revalidatePath("/admin/users");
    return result;
  });
}

export async function updateUserAction(_prev: UpdateUserResult | null, fd: FormData): Promise<UpdateUserResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("users.manage");
    const userId = parseWith(userIdSchema, form.str(fd, "userId"));
    const patch = parseWith(updateUserSchema, {
      fullName: form.str(fd, "fullName"),
      status: form.str(fd, "status"),
      roles: fd.has("roles") || form.bool(fd, "rolesEdited") ? form.all(fd, "roles") : undefined,
      whatsappDisplayName: form.str(fd, "whatsappDisplayName"),
      photoUrl: form.str(fd, "photoUrl"),
      shift: form.str(fd, "shift"),
      languages: form.list(fd, "languages"),
      skills: form.list(fd, "skills"),
      title: form.str(fd, "title"),
      maxConcurrent: form.num(fd, "maxConcurrent"),
      availabilityStatus: form.str(fd, "availabilityStatus"),
    });
    await authService.updateUser(actor, userId, patch);
    revalidatePath("/admin/users");
    return { id: userId };
  });
}

export async function resetCredentialsAction(_prev: ResetCredentialsResult | null, fd: FormData): Promise<ResetCredentialsResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("users.manage");
    const userId = parseWith(userIdSchema, form.str(fd, "userId"));
    const resetTotp = form.bool(fd, "resetTotp");
    const { temporaryPassword } = await authService.resetCredentials(actor, userId, { resetTotp });
    revalidatePath("/admin/users");
    // Shown once in the UI, never persisted in clear.
    return { id: userId, temporaryPassword, resetTotp };
  });
}

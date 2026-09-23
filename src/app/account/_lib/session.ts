import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { customerAuthService } from "@/server/services/customer-auth.service";

/**
 * One session read per request, shared by the account layout and every
 * account page (React `cache` dedupes within a render). Layouts cannot see
 * the pathname, so the layout gates with `next=/account` and each page
 * re-asserts with its own path — the second call is free.
 */
export const getCustomerSession = cache(() => customerAuthService.resolveCookies());

export async function requireCustomer(nextPath: string) {
  const session = await getCustomerSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}

/** First name when we have one, else the masked phone — never an empty greeting. */
export function customerDisplayName(customer: {
  firstName?: string;
  fullName?: string;
  phoneMasked: string;
}): string {
  const first = customer.firstName?.trim() || customer.fullName?.trim().split(/\s+/)[0];
  return first || customer.phoneMasked;
}

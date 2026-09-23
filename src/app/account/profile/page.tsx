import type { Metadata } from "next";
import { PageView } from "@/components/analytics/page-view";
import { customerService } from "@/server/services/customer.service";
import { requireCustomer } from "../_lib/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Profile & preferences",
  robots: { index: false, follow: false },
};

/**
 * PROFILE (customer-auth contract §4)
 *
 * Server Component: reads the real customer and their consent state, hands
 * plain data to the client form. Mutations go through Server Actions in
 * `../_actions.ts`, each of which re-resolves the session. No payment
 * preferences card — no saved instruments exist; payment links are sent by
 * the agent on WhatsApp.
 */
export default async function ProfilePage() {
  const session = await requireCustomer("/account/profile");
  const preferences = await customerService.getPreferences(session);
  const { customer } = session;

  return (
    <>
      <PageView pageType="account_profile" />
      <ProfileForm
        customer={{
          fullName: customer.fullName ?? "",
          email: customer.email ?? "",
          phoneMasked: customer.phoneMasked,
          dietary: customer.dietary,
          hotel: customer.hotel ?? "",
          preferredCurrency: customer.preferredCurrency,
        }}
        preferences={preferences}
      />
    </>
  );
}

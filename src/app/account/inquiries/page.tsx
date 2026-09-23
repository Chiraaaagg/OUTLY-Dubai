import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { CustomerInquiryCard } from "@/components/commerce/inquiry-ui";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { isClosedStatus } from "@/lib/inquiry-stages";
import { customerService } from "@/server/services/customer.service";
import { requireCustomer } from "../_lib/session";

export const metadata: Metadata = {
  title: "My inquiries",
  robots: { index: false, follow: false },
};

/**
 * MY INQUIRIES (customer-auth contract §4)
 *
 * Every inquiry made with the signed-in phone — linked by verified identity,
 * never claimed. Open ones first with the 4-stage track (21st.dev
 * @kavikatiyar/order-history, see `CustomerInquiryCard`), then the closed
 * ones. Status labels come from `src/lib/inquiry-stages.ts` so they match
 * the guest tracker exactly.
 */
export default async function InquiriesPage() {
  const session = await requireCustomer("/account/inquiries");
  const inquiries = await customerService.listInquiries(session);
  const open = inquiries.filter((i) => !isClosedStatus(i.status));
  const closed = inquiries.filter((i) => isClosedStatus(i.status));

  return (
    <>
      <PageView pageType="account_inquiries" />

      <section aria-labelledby="open">
        <h2 id="open" className="mb-4 text-2xl">
          Open inquiries
        </h2>
        {open.length ? (
          <ul className="space-y-4">
            {open.map((i) => (
              <li key={i.reference}>
                <CustomerInquiryCard inquiry={i} placement="account_inquiries" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
          illustration="inquiries"
            icon={<Inbox className="h-6 w-6" />}
            title="No open inquiries"
            body="When you ask us to check availability and price, it appears here with who's handling it and when they'll reply."
            action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          />
        )}
      </section>

      <section className="mt-10" aria-labelledby="closed">
        <h2 id="closed" className="mb-4 text-2xl">
          Completed
        </h2>
        {closed.length ? (
          <ul className="space-y-4">
            {closed.map((i) => (
              <li key={i.reference}>
                <CustomerInquiryCard inquiry={i} placement="account_inquiries" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">Nothing here yet.</p>
        )}
      </section>

      <p className="mt-8 text-sm text-ink-600">
        Once an inquiry is confirmed and paid, the trip appears under{" "}
        <Link href="/account/bookings" className="font-bold text-sun-700 underline underline-offset-2">
          My trips
        </Link>
        . Made an inquiry with a different number?{" "}
        <Link href="/inquiry/track" className="font-bold text-sun-700 underline underline-offset-2">
          Track it with the reference
        </Link>
        .
      </p>
    </>
  );
}

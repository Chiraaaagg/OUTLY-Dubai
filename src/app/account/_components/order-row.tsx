import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/primitives";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import type { Currency, Money, PaxCount } from "@/lib/types";
import { formatDateKey, paxLabel, priceIn } from "@/lib/utils";

/**
 * Customer order projection (`customerService.listOrders`): reference,
 * status, when it was placed, the items and the total — nothing about net
 * cost or the payment instrument. Structural so the server DTO satisfies it
 * without an adapter; `total` and `totals.total` are both accepted.
 */
export interface CustomerOrderLike {
  reference: string;
  status: string;
  placedAt?: string;
  currency?: Currency;
  total?: Money;
  totals?: { total?: Money };
  items: Array<{
    id?: string;
    title: string;
    date?: string;
    time?: string;
    pax?: PaxCount;
  }>;
}

export function orderTotal(order: CustomerOrderLike): Money | undefined {
  return order.total ?? order.totals?.total;
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  payment_failed: "Payment failed",
  supplier_pending: "Awaiting operator",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

function statusTone(status: string): "trust" | "warn" | "neutral" {
  if (status === "confirmed" || status === "completed") return "trust";
  if (status === "supplier_pending" || status === "pending_payment" || status === "payment_failed") return "warn";
  return "neutral";
}

/** Earliest activity date on the order, as a YYYY-MM-DD key, if any item has one. */
export function orderFirstDate(order: CustomerOrderLike): string | undefined {
  return order.items
    .map((i) => i.date)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
}

/**
 * One order, customer view. There is no per-order page in inquiry mode
 * (`/booking/[reference]` is fixture-backed), so the follow-up is the
 * WhatsApp thread with the reference pre-filled.
 */
export function OrderRow({ order, placement }: { order: CustomerOrderLike; placement: string }) {
  const first = order.items[0];
  const extra = order.items.length - 1;
  const total = orderTotal(order);
  const currency = order.currency ?? "INR";

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(order.status)} size="sm">
              {STATUS_LABEL[order.status] ?? order.status.replace(/_/g, " ")}
            </Badge>
            <span className="text-xs font-bold tnum text-ink-500">{order.reference}</span>
            {order.placedAt && (
              <span className="text-xs text-ink-500">· placed {formatDateKey(order.placedAt.slice(0, 10))}</span>
            )}
          </div>
          <h3 className="mt-1.5 text-[1.02rem] leading-snug text-ink-900">
            {first ? first.title : "Booking"}
            {extra > 0 && <span className="font-sans text-sm font-semibold text-ink-500"> + {extra} more</span>}
          </h3>
          {order.items.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-ink-600">
              {order.items.map((item, i) => (
                <li key={item.id ?? `${order.reference}-${i}`}>
                  {item.title}
                  {[item.date ? formatDateKey(item.date) : null, item.time, item.pax ? paxLabel(item.pax) : null]
                    .filter(Boolean)
                    .map((part) => ` · ${part}`)
                    .join("")}
                </li>
              ))}
            </ul>
          )}
          {total && (
            <p className="mt-2 text-sm text-ink-700">
              Total <span className="font-bold tnum text-ink-900">{priceIn(total, currency)}</span>
            </p>
          )}
        </div>

        <div className="shrink-0">
          <WhatsAppButton
            size="md"
            label="Get help with this trip"
            context={{ intent: "booking_support", bookingReference: order.reference, placement }}
          />
        </div>
      </div>
    </Card>
  );
}

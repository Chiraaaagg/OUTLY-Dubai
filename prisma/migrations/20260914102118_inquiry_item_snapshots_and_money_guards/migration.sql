-- AlterTable
ALTER TABLE "inquiry_items" ADD COLUMN     "cancellation_policy_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "inclusions_snapshot" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_source_inquiry_id_fkey" FOREIGN KEY ("source_inquiry_id") REFERENCES "inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written section (reviewed as SQL, §05.9). Additive only: nothing is
-- dropped, renamed or narrowed. Every check below is satisfiable by every row
-- the services can write today; they close gaps the init migration left.
-- ============================================================================

-- inquiry_items: the init check covered unit_inr / total_inr / total_aed only.
-- Cover the remaining money columns; confirmed_* are nullable so they are
-- NULL-safe. Money is BigInt minor units and never negative (§05.1 rule 1).
ALTER TABLE "inquiry_items"
  ADD CONSTRAINT inquiry_item_money_non_negative
    CHECK (indicative_unit_aed >= 0
       AND indicative_net_cost_aed >= 0
       AND (confirmed_total_inr   IS NULL OR confirmed_total_inr   >= 0)
       AND (confirmed_total_aed   IS NULL OR confirmed_total_aed   >= 0)
       AND (confirmed_net_cost_aed IS NULL OR confirmed_net_cost_aed >= 0));

-- orders / order_items / payments had `order_totals_consistent` but no sign
-- guard, so a negative discount could still balance the arithmetic.
ALTER TABLE "orders"
  ADD CONSTRAINT order_money_non_negative
    CHECK (subtotal_inr >= 0 AND subtotal_aed >= 0
       AND discount_inr >= 0 AND discount_aed >= 0
       AND tax_inr      >= 0 AND tax_aed      >= 0
       AND total_inr    >= 0 AND total_aed    >= 0
       AND net_cost_aed >= 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT order_item_money_non_negative
    CHECK (unit_inr >= 0 AND unit_aed >= 0
       AND total_inr >= 0 AND total_aed >= 0
       AND net_cost_aed >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT payment_amount_non_negative
    CHECK (amount_minor >= 0
       AND (fee_minor IS NULL OR fee_minor >= 0)
       AND (tax_on_fee_minor IS NULL OR tax_on_fee_minor >= 0));

-- §05.3.6: the same gateway payment must not be recorded twice. Partial unique
-- (Prisma cannot express it) — manual payment links without a gateway id are
-- unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_payment_idx
  ON "payments" (gateway, gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

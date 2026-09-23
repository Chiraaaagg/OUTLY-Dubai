import "server-only";
import { prisma } from "../lib/db";
import type { Actor } from "../lib/actor";
import { requirePermission } from "../lib/actor";
import { audit } from "../lib/audit";
import { Errors } from "../lib/errors";
import { moneyToMinor } from "../lib/money";
import { revalidateCatalog } from "../lib/catalog-cache";
import { activityBySlug as fixtureActivityBySlug } from "@/lib/data/activities";
import { comboBySlug } from "@/lib/data/combos";
import { activitySchema } from "../schemas/activity.schema";
import type { Activity } from "@/lib/types";
import { computeBreakdown } from "@/lib/pricing";
import { paxBillable, scaleMoney } from "@/lib/utils";
import type { CartItem, FulfilmentMode, Money, PaxCount } from "@/lib/types";

/**
 * Catalogue service — the read model the backend owns today:
 *
 *  - `fulfilment_mode` per product/combo (THE HINGE, §17 §6.4) with an
 *    audited admin flip. This is the Rathin go-live switch and its rollback.
 *  - Server-side re-pricing of cart items from `products.content` (the
 *    admin-owned activity document; fixtures only as a fallback for rows
 *    without a document), so an inquiry's indicative totals are never taken
 *    from the client (§13.1 threat #1 applies to indicative prices too — an
 *    agent triages on them). Combos are still fixture-priced (future phase).
 */

export interface PricedItem {
  cartItem: CartItem;
  productId?: string;
  comboId?: string;
  tier: string;
  unit: Money;
  total: Money;
  unitMinor: { inr: bigint; aed: bigint };
  totalMinor: { inr: bigint; aed: bigint };
  fulfilmentMode: FulfilmentMode;
  /** True when the client's total differed from the server's — recorded, not rejected. */
  clientMismatch: boolean;
  /** What the customer was shown — snapshotted onto inquiry_items and copied to order_items. */
  inclusions: string[];
  cancellationPolicy: Record<string, unknown>;
}

export const catalogService = {
  async priceCartItems(items: CartItem[]): Promise<PricedItem[]> {
    const slugs = items.map((i) => i.slug);
    const [products, combos] = await Promise.all([
      prisma.product.findMany({ where: { slug: { in: slugs }, deletedAt: null, status: "published" }, select: { id: true, slug: true, fulfilmentMode: true, tier: true, content: true } }),
      prisma.combo.findMany({ where: { slug: { in: slugs }, deletedAt: null }, select: { id: true, slug: true, fulfilmentMode: true, tier: true } }),
    ]);
    const productBySlug = new Map(products.map((p) => [p.slug, p]));
    const comboBySlugDb = new Map(combos.map((c) => [c.slug, c]));

    const out: PricedItem[] = [];
    for (const item of items) {
      const pax: PaxCount = item.pax;
      if (item.kind === "combo") {
        const combo = comboBySlug(item.slug);
        const row = comboBySlugDb.get(item.slug);
        if (!combo || !row) throw Errors.validation({ items: `Unknown package: ${item.slug}` });
        const billable = Math.max(1, paxBillable(pax));
        const base = scaleMoney(combo.bundlePrice, billable);
        const upgrades = combo.upgrades.filter((u) => item.addOnIds.includes(u.id));
        const total = upgrades.reduce(
          (sum, u) => ({
            inr: sum.inr + (u.perPerson ? u.price.inr * billable : u.price.inr),
            aed: sum.aed + (u.perPerson ? u.price.aed * billable : u.price.aed),
          }),
          base,
        );
        out.push({
          cartItem: item,
          comboId: row.id,
          tier: row.tier,
          unit: combo.bundlePrice,
          total,
          unitMinor: moneyToMinor(combo.bundlePrice),
          totalMinor: moneyToMinor(total),
          fulfilmentMode: row.fulfilmentMode,
          clientMismatch: Math.round(total.inr) !== Math.round(item.total.inr),
          inclusions: combo.highlights,
          cancellationPolicy: { text: combo.cancellationPolicy, freeCancellationHours: item.freeCancellationHours },
        });
        continue;
      }

      const row = productBySlug.get(item.slug);
      const parsed = row ? activitySchema.safeParse(row.content) : null;
      const activity: Activity | undefined = parsed?.success ? (parsed.data as Activity) : fixtureActivityBySlug(item.slug);
      if (!activity || !row) throw Errors.validation({ items: `Unknown activity: ${item.slug}` });
      const breakdown = computeBreakdown(activity, pax, item.variantId, item.addOnIds);
      out.push({
        cartItem: item,
        productId: row.id,
        tier: row.tier,
        unit: breakdown.perPersonFrom,
        total: breakdown.total,
        unitMinor: moneyToMinor(breakdown.perPersonFrom),
        totalMinor: moneyToMinor(breakdown.total),
        fulfilmentMode: row.fulfilmentMode,
        clientMismatch: Math.round(breakdown.total.inr) !== Math.round(item.total.inr),
        inclusions: activity.inclusions,
        cancellationPolicy: { text: activity.cancellationPolicy, freeCancellationHours: activity.freeCancellationHours },
      });
    }
    return out;
  },

  async listProducts() {
    const rows = await prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ tier: "asc" }, { title: "asc" }],
      include: { mappings: { where: { isActive: true }, include: { supplier: { select: { source: true, adapter: true, status: true, deletedAt: true } } } } },
    });
    return rows.map(({ mappings, ...p }) => ({
      ...p,
      hasApiMapping: mappings.some((m) => m.supplier.source === "api" && m.supplier.adapter !== "manual" && m.supplier.status === "active" && !m.supplier.deletedAt),
    }));
  },

  async listCombos() {
    return prisma.combo.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  },

  /** Public: which slugs are instant right now — the storefront's future read model for the hinge. */
  async fulfilmentModes(): Promise<Record<string, FulfilmentMode>> {
    const [products, combos] = await Promise.all([
      prisma.product.findMany({ where: { deletedAt: null }, select: { slug: true, fulfilmentMode: true } }),
      prisma.combo.findMany({ where: { deletedAt: null }, select: { slug: true, fulfilmentMode: true } }),
    ]);
    const out: Record<string, FulfilmentMode> = {};
    for (const p of products) out[p.slug] = p.fulfilmentMode;
    for (const c of combos) out[c.slug] = c.fulfilmentMode;
    return out;
  },

  /**
   * The flip (§17 §8.2). Per SKU, reversible, audited with a reason. Flipping
   * to `instant` requires the product to have an active API supplier mapping —
   * you cannot promise instant confirmation with a manual supplier.
   */
  async setFulfilmentMode(actor: Actor, target: { kind: "product" | "combo"; id: string }, mode: FulfilmentMode, reason: string) {
    requirePermission(actor, "products.publish");
    if (!reason.trim()) throw Errors.validation({ reason: "A reason is required — this changes what customers are promised" });

    if (target.kind === "product") {
      const before = await prisma.product.findUnique({ where: { id: target.id }, include: { mappings: { include: { supplier: true } } } });
      if (!before) throw Errors.notFound("Product");
      if (mode === "instant") {
        const apiMapping = before.mappings.find(
          (m) => m.isActive && m.supplier.source === "api" && m.supplier.adapter !== "manual" && m.supplier.status === "active" && !m.supplier.deletedAt,
        );
        if (!apiMapping) {
          throw Errors.conflict("Instant mode needs an active API supplier mapping (Rathin) on this product", { productId: target.id });
        }
      }
      const after = await prisma.product.update({ where: { id: target.id }, data: { fulfilmentMode: mode } });
      await audit(actor, "product.fulfilment_mode", { type: "product", id: target.id }, { before: { fulfilmentMode: before.fulfilmentMode }, after: { fulfilmentMode: after.fulfilmentMode }, reason });
      revalidateCatalog();
      return after;
    }

    const before = await prisma.combo.findUnique({ where: { id: target.id } });
    if (!before) throw Errors.notFound("Combo");
    if (mode === "instant") throw Errors.conflict("Combos stay inquiry-mode until every component product is instant");
    const after = await prisma.combo.update({ where: { id: target.id }, data: { fulfilmentMode: mode } });
    await audit(actor, "combo.fulfilment_mode", { type: "combo", id: target.id }, { before: { fulfilmentMode: before.fulfilmentMode }, after: { fulfilmentMode: after.fulfilmentMode }, reason });
    return after;
  },
};

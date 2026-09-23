import { Alert } from "@/components/ui/primitives";
import { catalogService } from "@/server/services/catalog.service";
import { hasPermission } from "@/server/lib/actor";
import { requirePage } from "../../_lib/guard";
import { DataTable, PageHeader, StatusPill, type DataColumn } from "../../_components/ui";
import { FulfilmentFlip } from "./fulfilment-flip";

/**
 * /admin/products — the catalogue read model the backend owns today: tier,
 * confirmation type and `fulfilment_mode` per SKU. The flip is THE HINGE
 * (§17 §6.4): per product, reversible, audited with a reason. Full product
 * CRUD arrives with the catalogue migration (§10 §2.4).
 */
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  kind: "product" | "combo";
  name: string;
  slug: string;
  tier: string;
  status: string;
  confirmation: "instant" | "manual";
  fulfilmentMode: "inquiry" | "instant";
  category?: string;
  quoteOnly?: boolean;
}

export default async function AdminProductsPage() {
  const { actor } = await requirePage("products.edit");
  const canFlip = hasPermission(actor, "products.publish");
  const [products, combos] = await Promise.all([catalogService.listProducts(), catalogService.listCombos()]);

  const productRows: Row[] = products.map((p) => ({
    id: p.id,
    kind: "product",
    name: p.title,
    slug: p.slug,
    tier: p.tier,
    status: p.status,
    confirmation: p.confirmation,
    fulfilmentMode: p.fulfilmentMode,
    category: p.categorySlug,
    quoteOnly: p.quoteOnly,
  }));
  const comboRows: Row[] = combos.map((c) => ({
    id: c.id,
    kind: "combo",
    name: c.name,
    slug: c.slug,
    tier: c.tier,
    status: c.status,
    confirmation: c.confirmation,
    fulfilmentMode: c.fulfilmentMode,
  }));

  const instantCount = productRows.filter((r) => r.fulfilmentMode === "instant").length;

  const columns: DataColumn<Row>[] = [
    {
      key: "name",
      header: "SKU",
      cell: (r) => (
        <div>
          <p className="font-semibold text-ink-900">{r.name}</p>
          <p className="font-mono text-2xs text-ink-500">
            {r.slug}
            {r.category ? ` · ${r.category}` : ""}
          </p>
        </div>
      ),
    },
    { key: "tier", header: "Tier", cell: (r) => <StatusPill tone={r.tier === "A" ? "accent" : "neutral"}>Tier {r.tier}</StatusPill> },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={r.status === "published" ? "success" : "warning"}>{r.status}</StatusPill>
          {r.quoteOnly && <StatusPill tone="info">quote only</StatusPill>}
        </div>
      ),
    },
    { key: "confirmation", header: "Supplier confirms", cell: (r) => <span className="text-ink-700">{r.confirmation === "instant" ? "Instantly (API)" : "Manually"}</span> },
    {
      key: "mode",
      header: "Fulfilment",
      cell: (r) => <StatusPill tone={r.fulfilmentMode === "instant" ? "success" : "info"}>{r.fulfilmentMode === "instant" ? "Instant booking" : "Inquiry"}</StatusPill>,
    },
    {
      key: "flip",
      header: canFlip ? "Change mode" : <span className="sr-only">Change mode</span>,
      cell: (r) => (canFlip ? <FulfilmentFlip id={r.id} kind={r.kind} name={r.name} current={r.fulfilmentMode} /> : <span className="text-2xs text-ink-400">needs products.publish</span>),
      className: "min-w-[18rem]",
    },
  ];

  return (
    <>
      <PageHeader title="Products" sub={`${productRows.length} products, ${comboRows.length} combos · ${instantCount} on instant booking`} />

      <Alert tone="info" title="How the fulfilment switch works" className="mb-5">
        <p>
          Every SKU is in <strong>inquiry</strong> mode until it is flipped. Flipping a product to <strong>instant</strong> requires an active API supplier mapping (Rathin) on that product —
          the service refuses otherwise, because you cannot promise instant confirmation with a manual supplier. Combos stay in inquiry mode until every component product is instant.
          Rollback is the same switch the other way. Every flip is audited with your reason. There is deliberately no site-wide switch.
        </p>
      </Alert>

      <h2 className="mb-2 text-lg">Products</h2>
      <DataTable columns={columns} rows={productRows} rowKey={(r) => r.id} caption="Products" empty="No products in the database. Run the seed." className="mb-6" />

      <h2 className="mb-2 text-lg">Combos</h2>
      <DataTable columns={columns} rows={comboRows} rowKey={(r) => r.id} caption="Combos" empty="No combos in the database." />
    </>
  );
}

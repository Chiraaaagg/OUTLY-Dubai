"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ArrowUpDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { track } from "@/lib/analytics";
import { hasInstantProducts } from "@/lib/data/activities";
import { useSlimCatalog } from "@/lib/catalog/client";
import { cn } from "@/lib/utils";
import type { SortKey } from "@/lib/types";

/**
 * Filters and sort.
 *
 * Two rules from the PRD shape this component:
 *  1. Dietary, accessibility and language needs are first-class filters, not
 *     footnotes — so Food and Who's coming sit above Price and Duration.
 *  2. Filter state lives in the URL (AC-SRCH-02), so results are shareable and
 *     the back button behaves. Nothing here holds filter state in React beyond
 *     the draft inside the mobile drawer.
 */

export const SORTS: { id: SortKey; label: string; hint: string }[] = [
  { id: "recommended", label: "Recommended", hint: "Relevance, ratings and reliability combined" },
  { id: "popularity", label: "Most booked", hint: "What people actually buy" },
  { id: "price_asc", label: "Price: low to high", hint: "" },
  { id: "price_desc", label: "Price: high to low", hint: "" },
  { id: "rating", label: "Highest rated", hint: "" },
  { id: "duration", label: "Shortest first", hint: "" },
];

const DIETARY = [
  { id: "veg", label: "Pure vegetarian" },
  { id: "jain", label: "Jain (no onion/garlic)" },
  { id: "halal", label: "Halal" },
];

const SUITABILITY = [
  { id: "kids", label: "Good with kids" },
  { id: "seniors", label: "Senior-friendly" },
  { id: "wheelchair", label: "Wheelchair accessible" },
  { id: "infant", label: "Infant-friendly" },
  { id: "couples", label: "Good for couples" },
];

/**
 * "Instant confirmation" is rendered conditionally on catalogue content, not a
 * constant: while every SKU is inquiry-mode the filter would return everything
 * or nothing, and the claim would be false. It returns automatically when the
 * first product flips (pivot §2.1, Search row).
 */
const CONVENIENCE = [
  ...(hasInstantProducts() ? [{ id: "instant", label: "Instant confirmation" }] : []),
  { id: "freeCancellation", label: "Free cancellation" },
  { id: "pickup", label: "Hotel pickup included" },
  { id: "privateOnly", label: "Private option available" },
];

const DURATIONS = [
  { id: "short", label: "Up to 2 hours" },
  { id: "half", label: "Half day (2–5h)" },
  { id: "full", label: "Full day (5h+)" },
];

const PRICES = [
  { id: "3000", label: "Under ₹3,000" },
  { id: "6000", label: "Under ₹6,000" },
  { id: "10000", label: "Under ₹10,000" },
];

export function useFilterParams() {
  const params = useSearchParams();
  const router = useRouter();

  const set = useCallback(
    (patch: Record<string, string | null>, label?: string) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      });
      next.delete("page");
      if (label) track("filter_applied", { filters: label });
      router.push(`?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const toggleMulti = useCallback(
    (key: string, value: string) => {
      const current = (params.get(key) ?? "").split(",").filter(Boolean);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      set({ [key]: next.join(",") || null }, `${key}:${value}`);
    },
    [params, set],
  );

  return { params, set, toggleMulti };
}

export function activeFilterCount(params: URLSearchParams): number {
  const keys = [
    "category",
    "dietary",
    "suitability",
    "instant",
    "freeCancellation",
    "pickup",
    "privateOnly",
    "duration",
    "maxPrice",
    "rating",
    "when",
    "date",
  ];
  return keys.filter((k) => params.get(k)).length;
}

/* ---------------------------------------------------------------------------
 * Filter panel body — shared by the desktop sidebar and the mobile drawer
 * ------------------------------------------------------------------------ */

function FilterBody() {
  const { categories } = useSlimCatalog();
  const { params, set, toggleMulti } = useFilterParams();
  const dietary = (params.get("dietary") ?? "").split(",").filter(Boolean);
  const suitability = (params.get("suitability") ?? "").split(",").filter(Boolean);

  return (
    <div className="space-y-6">
      <Group title="When">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "today", label: "Today" },
            { id: "tomorrow", label: "Tomorrow" },
          ].map((o) => (
            <Chip
              key={o.id}
              active={params.get("when") === o.id}
              onClick={() => set({ when: params.get("when") === o.id ? null : o.id }, `when:${o.id}`)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Food" hint="Confirmed with the supplier's kitchen, printed on your voucher.">
        {DIETARY.map((d) => (
          <Check
            key={d.id}
            label={d.label}
            checked={dietary.includes(d.id)}
            onChange={() => toggleMulti("dietary", d.id)}
          />
        ))}
      </Group>

      <Group title="Who's coming">
        {SUITABILITY.map((s) => (
          <Check
            key={s.id}
            label={s.label}
            checked={suitability.includes(s.id)}
            onChange={() => toggleMulti("suitability", s.id)}
          />
        ))}
      </Group>

      <Group title="Booking convenience">
        {CONVENIENCE.map((c) => (
          <Check
            key={c.id}
            label={c.label}
            checked={params.get(c.id) === "1"}
            onChange={() => set({ [c.id]: params.get(c.id) === "1" ? null : "1" }, c.id)}
          />
        ))}
      </Group>

      <Group title="Price (per adult, all-in)">
        <div className="flex flex-wrap gap-2">
          {PRICES.map((p) => (
            <Chip
              key={p.id}
              active={params.get("maxPrice") === p.id}
              onClick={() =>
                set(
                  { maxPrice: params.get("maxPrice") === p.id ? null : p.id },
                  `maxPrice:${p.id}`,
                )
              }
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Category">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Chip
              key={c.slug}
              active={params.get("category") === c.slug}
              onClick={() =>
                set(
                  { category: params.get("category") === c.slug ? null : c.slug },
                  `category:${c.slug}`,
                )
              }
            >
              {c.shortName}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Duration">
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <Chip
              key={d.id}
              active={params.get("duration") === d.id}
              onClick={() =>
                set({ duration: params.get("duration") === d.id ? null : d.id }, `duration:${d.id}`)
              }
            >
              {d.label}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Rating">
        <div className="flex flex-wrap gap-2">
          {["4.5", "4"].map((r) => (
            <Chip
              key={r}
              active={params.get("rating") === r}
              onClick={() => set({ rating: params.get("rating") === r ? null : r }, `rating:${r}`)}
            >
              {r}+ stars
            </Chip>
          ))}
        </div>
      </Group>
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-ink-900">{title}</legend>
      {hint && <p className="mb-2 mt-0.5 text-xs leading-snug text-ink-500">{hint}</p>}
      <div className={cn("space-y-1", !hint && "mt-2")}>{children}</div>
    </fieldset>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4.5 w-4.5 rounded border-ink-300 accent-ink-900"
      />
      {label}
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-ink-900 bg-ink-900 text-white"
          : "border-ink-300 bg-paper text-ink-700 hover:border-ink-900",
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Desktop sidebar
 * ------------------------------------------------------------------------ */

export function FilterSidebar({ resultCount }: { resultCount: number }) {
  const { params, set } = useFilterParams();
  const count = activeFilterCount(new URLSearchParams(params.toString()));

  return (
    <aside className="hidden lg:block" aria-label="Filters">
      {/*
       * Sticky wrapper scrolls only when the filter card is taller than the
       * viewport, and never shows a scrollbar track (Windows paints one
       * permanently on `overflow-y: auto` boxes). The card itself is natural
       * height so short lists sit in a plain bordered box.
       */}
      <div className="no-scrollbar sticky top-32 max-h-[calc(100vh-9rem)] overflow-y-auto overscroll-contain">
        <div className="rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg">Filters</h2>
            {count > 0 && (
              <button
                type="button"
                onClick={() =>
                  set(
                    Object.fromEntries(
                      [
                        "category",
                        "dietary",
                        "suitability",
                        "instant",
                        "freeCancellation",
                        "pickup",
                        "privateOnly",
                        "duration",
                        "maxPrice",
                        "rating",
                        "when",
                      ].map((k) => [k, null]),
                    ),
                    "clear_all",
                  )
                }
                className="text-xs font-bold text-sun-700 underline underline-offset-2"
              >
                Clear all ({count})
              </button>
            )}
          </div>
          <p className="mb-4 text-xs text-ink-500 tnum">{resultCount} experiences match</p>
          <FilterBody />
        </div>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------------------
 * Mobile toolbar: filter drawer + sort drawer
 * ------------------------------------------------------------------------ */

export function FilterToolbar({ resultCount }: { resultCount: number }) {
  const { params, set } = useFilterParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const count = useMemo(
    () => activeFilterCount(new URLSearchParams(params.toString())),
    [params],
  );
  const sort = (params.get("sort") as SortKey) ?? "recommended";
  const sortLabel = SORTS.find((s) => s.id === sort)?.label ?? "Recommended";

  return (
    <>
      <div className="sticky top-[7.5rem] z-30 -mx-4 mb-4 flex gap-2 border-b border-ink-200 bg-sand/95 px-4 py-2.5 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen(true)}
          className="lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {count > 0 && (
            <span className="ml-0.5 rounded-full bg-sun-500 px-1.5 text-2xs font-bold tnum text-white">
              {count}
            </span>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSortOpen(true)}>
          <ArrowUpDown className="h-4 w-4" />
          {sortLabel}
        </Button>
        <p className="ml-auto flex items-center text-xs text-ink-500 tnum lg:hidden">
          {resultCount} results
        </p>
      </div>

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        description={`${resultCount} experiences match`}
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                set(
                  Object.fromEntries(
                    [
                      "category",
                      "dietary",
                      "suitability",
                      "instant",
                      "freeCancellation",
                      "pickup",
                      "privateOnly",
                      "duration",
                      "maxPrice",
                      "rating",
                      "when",
                    ].map((k) => [k, null]),
                  ),
                  "clear_all",
                )
              }
            >
              Clear all
            </Button>
            <Button className="flex-[1.4]" onClick={() => setFiltersOpen(false)}>
              Show {resultCount} results
            </Button>
          </div>
        }
      >
        <FilterBody />
      </Sheet>

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <div className="space-y-1">
          {SORTS.map((s) => (
            <label
              key={s.id}
              className="flex min-h-13 cursor-pointer items-start gap-3 rounded-[var(--radius-control)] p-3 hover:bg-shell"
            >
              <input
                type="radio"
                name="sort"
                checked={sort === s.id}
                onChange={() => {
                  set({ sort: s.id === "recommended" ? null : s.id });
                  track("sort_applied", { sort: s.id });
                  setSortOpen(false);
                }}
                className="mt-1 h-4 w-4 accent-ink-900"
              />
              <span>
                <span className="block text-sm font-bold text-ink-900">{s.label}</span>
                {s.hint && <span className="block text-xs text-ink-500">{s.hint}</span>}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-4 rounded-[var(--radius-control)] bg-shell p-3 text-xs leading-relaxed text-ink-600">
          <strong className="font-bold">How &ldquo;Recommended&rdquo; works:</strong> a blend of how
          well an experience matches your filters, how it converts, its margin tier and the
          supplier&apos;s reliability score. We&apos;d rather tell you than pretend it&apos;s neutral.
        </p>
      </Sheet>
    </>
  );
}

/** Applied-filter pills with individual removal. */
export function ActiveFilterPills() {
  const { params, set } = useFilterParams();
  const entries: { key: string; value: string; label: string }[] = [];

  const push = (key: string, label: string) => {
    const v = params.get(key);
    if (v) entries.push({ key, value: v, label });
  };

  push("when", `When: ${params.get("when")}`);
  push("category", `Category: ${params.get("category")?.replace(/-/g, " ")}`);
  push("duration", `Duration: ${params.get("duration")}`);
  push("maxPrice", `Under ₹${Number(params.get("maxPrice")).toLocaleString("en-IN")}`);
  push("rating", `${params.get("rating")}+ stars`);
  CONVENIENCE.map((c) => c.id).forEach((k) => {
    if (params.get(k) === "1")
      entries.push({
        key: k,
        value: "1",
        label: CONVENIENCE.find((c) => c.id === k)?.label ?? k,
      });
  });
  (params.get("dietary") ?? "")
    .split(",")
    .filter(Boolean)
    .forEach((d) =>
      entries.push({ key: "dietary", value: d, label: DIETARY.find((x) => x.id === d)?.label ?? d }),
    );
  (params.get("suitability") ?? "")
    .split(",")
    .filter(Boolean)
    .forEach((s) =>
      entries.push({
        key: "suitability",
        value: s,
        label: SUITABILITY.find((x) => x.id === s)?.label ?? s,
      }),
    );

  if (!entries.length) return null;

  return (
    <ul className="mb-4 flex flex-wrap gap-2" aria-label="Active filters">
      {entries.map((e) => (
        <li key={`${e.key}-${e.value}`}>
          <button
            type="button"
            onClick={() => {
              if (e.key === "dietary" || e.key === "suitability") {
                const rest = (params.get(e.key) ?? "")
                  .split(",")
                  .filter((v) => v && v !== e.value);
                set({ [e.key]: rest.join(",") || null });
              } else {
                set({ [e.key]: null });
              }
            }}
            className="flex items-center gap-1.5 rounded-full border border-ink-900 bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {e.label}
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Remove filter</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

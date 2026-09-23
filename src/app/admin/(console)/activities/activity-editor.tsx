"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { ADDON_CATEGORIES, DIETARY, SUITABILITY, TIERS, type ActivityInput } from "@/server/schemas/activity.schema";
import { saveActivityAction, restoreVersionAction, type ActivityRowResult, type SaveActivityResult } from "../../_actions/activities";
import { FormField, INPUT_CLASS, Panel, StatusPill, fmtDateTime } from "../../_components/ui";

/**
 * Full activity editor. State is one `ActivityInput` object; the form posts
 * it as JSON (`payload`) and the strict zod schema on the server decides.
 * Server-side field errors come back keyed by path and are rendered next to
 * the matching control. Lists are edited as one-item-per-line textareas;
 * structured lists (itinerary, variants, add-ons) use compact one-line-per-
 * item syntax with a JSON escape hatch.
 */

export interface EditorCategory {
  slug: string;
  name: string;
}

export interface EditorVersion {
  version: number;
  status: string;
  reason: string | null;
  createdAt: string;
}

export interface EditorProps {
  mode: "create" | "edit";
  id?: string;
  version?: number;
  status?: string;
  fulfilmentMode?: "inquiry" | "instant";
  initial: ActivityInput;
  categories: EditorCategory[];
  versions?: EditorVersion[];
  canPublish: boolean;
}

type Money = { inr: number; aed: number };

const EMPTY: ActivityInput = {
  slug: "",
  title: "",
  subtitle: "",
  tier: "B",
  categorySlug: "",
  secondaryCategorySlugs: [],
  collectionSlugs: [],
  images: [],
  imageAlt: "",
  durationMinutes: 120,
  isPrivate: false,
  pickupIncluded: false,
  pickupZones: [],
  confirmation: "manual",
  fulfilmentMode: "inquiry",
  freeCancellationHours: 24,
  mobileVoucher: true,
  dietary: [],
  suitability: [],
  location: "",
  meetingPoint: "",
  timeSlots: [],
  price: { adult: { inr: 0, aed: 0 } },
  inclusions: [],
  exclusions: [],
  itinerary: [],
  importantInfo: [],
  cancellationPolicy: "",
  variants: [],
  addOns: [],
  faqs: [],
  relatedSlugs: [],
  comboSlugs: [],
  supplier: { id: "outlyy-direct", name: "OUTLYY direct", source: "direct", reliability: 80, verifiedSince: String(new Date().getFullYear()) },
  badges: {},
  seo: { title: "", description: "", keywords: [] },
};

export function emptyActivityInput(): ActivityInput {
  return structuredClone(EMPTY);
}

/* ------------------------------------------------------------ helpers */

const lines = (v: string[] | undefined) => (v ?? []).join("\n");
const fromLines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

function faqsToText(v: ActivityInput["faqs"]) {
  return v.map((f) => `${f.q} :: ${f.a}`).join("\n");
}
function faqsFromText(s: string): ActivityInput["faqs"] {
  return fromLines(s).map((l) => {
    const [q, ...a] = l.split("::");
    return { q: (q ?? "").trim(), a: a.join("::").trim() };
  });
}
function itineraryToText(v: ActivityInput["itinerary"]) {
  return v.map((i) => `${i.time} :: ${i.title} :: ${i.detail}${i.durationMin ? ` :: ${i.durationMin}` : ""}`).join("\n");
}
function itineraryFromText(s: string): ActivityInput["itinerary"] {
  return fromLines(s).map((l) => {
    const [time, title, detail, dur] = l.split("::").map((x) => x.trim());
    const durationMin = dur ? Number(dur) : undefined;
    return { time: time ?? "", title: title ?? "", detail: detail ?? "", ...(durationMin && Number.isFinite(durationMin) ? { durationMin } : {}) };
  });
}

function fieldError(fields: Record<string, string> | undefined, path: string): string | undefined {
  if (!fields) return undefined;
  if (fields[path]) return fields[path];
  const prefix = `${path}.`;
  const k = Object.keys(fields).find((f) => f.startsWith(prefix));
  return k ? `${k.slice(prefix.length)}: ${fields[k]}` : undefined;
}

function Text({ id, label, value, onChange, error, hint, required, type = "text", className }: { id: string; label: string; value: string | number; onChange: (v: string) => void; error?: string; hint?: ReactNode; required?: boolean; type?: string; className?: string }) {
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint} required={required} className={className}>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} className={INPUT_CLASS} />
    </FormField>
  );
}

function Area({ id, label, value, onChange, error, hint, rows = 4, required }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; rows?: number; required?: boolean }) {
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} aria-invalid={error ? true : undefined} className={`${INPUT_CLASS} min-h-0 py-2 font-mono text-sm leading-relaxed`} />
    </FormField>
  );
}

function MoneyRow({ id, label, value, onChange, error, optional }: { id: string; label: string; value: Money | undefined; onChange: (v: Money | undefined) => void; error?: string; optional?: boolean }) {
  const inr = value?.inr ?? "";
  const aed = value?.aed ?? "";
  const set = (k: "inr" | "aed", raw: string) => {
    if (raw === "" && optional && (k === "inr" ? aed === "" : inr === "")) return onChange(undefined);
    const n = Number(raw);
    onChange({ inr: k === "inr" ? n : Number(inr || 0), aed: k === "aed" ? n : Number(aed || 0) });
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Text id={`${id}-inr`} label={`${label} ₹`} type="number" value={inr} onChange={(v) => set("inr", v)} error={error} required={!optional} />
      <Text id={`${id}-aed`} label={`${label} AED`} type="number" value={aed} onChange={(v) => set("aed", v)} required={!optional} />
    </div>
  );
}

function Checks<T extends string>({ label, options, value, onChange, labels }: { label: string; options: readonly T[]; value: T[]; onChange: (v: T[]) => void; labels?: Record<string, string> }) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-semibold text-ink-800">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm ${on ? "border-sun-500 bg-sun-50 text-sun-700" : "border-ink-300 bg-paper text-ink-700"}`}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} />
              {labels?.[o] ?? o}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Toggle({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border border-ink-200 bg-paper px-3 py-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-sun-500)]" />
      <span>
        <span className="block text-sm font-semibold text-ink-800">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------- editor */

export function ActivityEditor(props: EditorProps) {
  const router = useRouter();
  const [a, setA] = useState<ActivityInput>(() => structuredClone(props.initial));
  const [slugTouched, setSlugTouched] = useState(props.mode === "edit");
  const [reason, setReason] = useState("");
  const [publishOnCreate, setPublishOnCreate] = useState(false);
  const [structuredText, setStructuredText] = useState(() => ({
    faqs: faqsToText(props.initial.faqs),
    itinerary: itineraryToText(props.initial.itinerary),
    variants: JSON.stringify(props.initial.variants, null, 2),
    addOns: JSON.stringify(props.initial.addOns, null, 2),
  }));
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState<SaveActivityResult | null, FormData>(saveActivityAction, null);
  const [restoreState, restoreAction, restorePending] = useActionState<ActivityRowResult | null, FormData>(restoreVersionAction, null);

  useEffect(() => {
    if (state?.ok && props.mode === "create") router.replace(`/admin/activities/${state.data.id}`);
    else if (state?.ok) router.refresh();
  }, [state, props.mode, router]);

  useEffect(() => {
    if (restoreState?.ok) router.refresh();
  }, [restoreState, router]);

  /** The version the server last confirmed, which is newer than `props.version` between a save and its refresh. */
  const liveVersion = state?.ok && props.mode === "edit" ? state.data.version : props.version;

  const fields = state && !state.ok ? state.fields : undefined;
  const err = (path: string) => fieldError(fields, path);
  const set = <K extends keyof ActivityInput>(k: K, v: ActivityInput[K]) => setA((prev) => ({ ...prev, [k]: v }));

  const payload = useMemo(() => {
    const next: ActivityInput = { ...a };
    const errs: Record<string, string> = {};
    next.faqs = faqsFromText(structuredText.faqs);
    next.itinerary = itineraryFromText(structuredText.itinerary);
    for (const k of ["variants", "addOns"] as const) {
      try {
        const parsed = structuredText[k].trim() ? JSON.parse(structuredText[k]) : [];
        if (!Array.isArray(parsed)) throw new Error("must be a JSON array");
        (next as unknown as Record<string, unknown>)[k] = parsed;
      } catch (e) {
        errs[k] = `Invalid JSON: ${e instanceof Error ? e.message : "check the syntax"}`;
      }
    }
    return { next, errs };
  }, [a, structuredText]);

  useEffect(() => setJsonErrors(payload.errs), [payload.errs]);

  const title = props.mode === "create" ? "New activity" : a.title || "Edit activity";
  const priceErr = err("price.adult");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="payload" value={JSON.stringify(payload.next)} />
      {props.id && <input type="hidden" name="id" value={props.id} />}
      {/* After a save the server props lag behind until router.refresh() lands; using the
          version the save returned stops a quick second save colliding with itself. */}
      {liveVersion !== undefined && <input type="hidden" name="expectedVersion" value={liveVersion} />}
      {props.mode === "create" && <input type="hidden" name="status" value={publishOnCreate ? "published" : "draft"} />}

      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 bg-sand/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-xl leading-tight sm:text-2xl">{title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-600">
            {props.status && <StatusPill tone={props.status === "published" ? "success" : props.status === "draft" ? "warning" : "neutral"}>{props.status}</StatusPill>}
            {props.version !== undefined && <span>v{props.version}</span>}
            {props.fulfilmentMode && <span>· fulfilment: {props.fulfilmentMode} (change on the Products page)</span>}
            {props.id && a.slug && (
              <a href={`/activities/${a.slug}`} target="_blank" rel="noreferrer" className="underline">
                View on site
              </a>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href="/admin/activities" variant="ghost" size="sm">
            Back
          </ButtonLink>
          {props.mode === "create" && props.canPublish && (
            <label className="inline-flex items-center gap-1.5 text-sm text-ink-800">
              <input type="checkbox" checked={publishOnCreate} onChange={(e) => setPublishOnCreate(e.target.checked)} className="h-4 w-4" /> Publish now
            </label>
          )}
          <Button type="submit" size="sm" loading={pending} loadingLabel="Saving…" disabled={Object.keys(jsonErrors).length > 0}>
            {props.mode === "create" ? (publishOnCreate ? "Create & publish" : "Create draft") : "Save changes"}
          </Button>
        </div>
      </div>

      {state && !state.ok && (
        <Alert tone="danger" title={state.message}>
          {state.recovery && <p>{state.recovery}</p>}
          {fields && (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {Object.entries(fields)
                .slice(0, 12)
                .map(([k, v]) => (
                  <li key={k}>
                    <code className="font-mono text-xs">{k}</code>: {v}
                  </li>
                ))}
            </ul>
          )}
        </Alert>
      )}
      {state?.ok && props.mode === "edit" && (
        <Alert tone="success" title={`Saved as version ${state.data.version}`}>
          <p>The storefront updates within a minute.</p>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Panel title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <Text
                id="title"
                label="Activity name"
                required
                value={a.title}
                error={err("title")}
                onChange={(v) => {
                  set("title", v);
                  if (!slugTouched) set("slug", slugify(v));
                }}
                className="sm:col-span-2"
              />
              <Text
                id="slug"
                label="Slug (URL)"
                required
                value={a.slug}
                error={err("slug")}
                hint={`/activities/${a.slug || "…"}`}
                onChange={(v) => {
                  setSlugTouched(true);
                  set("slug", v.toLowerCase());
                }}
              />
              <FormField label="Tier" htmlFor="tier" error={err("tier")} required>
                <select id="tier" value={a.tier} onChange={(e) => set("tier", e.target.value as ActivityInput["tier"])} className={INPUT_CLASS}>
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      Tier {t}
                    </option>
                  ))}
                </select>
              </FormField>
              <Text id="subtitle" label="Subtitle (card + search line)" required value={a.subtitle} error={err("subtitle")} onChange={(v) => set("subtitle", v)} className="sm:col-span-2" />
              <FormField label="Category" htmlFor="categorySlug" error={err("categorySlug")} required>
                <select id="categorySlug" value={a.categorySlug} onChange={(e) => set("categorySlug", e.target.value)} className={INPUT_CLASS}>
                  <option value="">Choose…</option>
                  {props.categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <Checks label="Sub-categories" options={props.categories.map((c) => c.slug).filter((s) => s !== a.categorySlug)} value={a.secondaryCategorySlugs} onChange={(v) => set("secondaryCategorySlugs", v)} labels={Object.fromEntries(props.categories.map((c) => [c.slug, c.name]))} />
              <Text id="attractionSlug" label="Attraction hub slug" value={a.attractionSlug ?? ""} error={err("attractionSlug")} hint="Optional, e.g. burj-khalifa" onChange={(v) => set("attractionSlug", v || undefined)} />
              <Area id="collectionSlugs" label="Collections (one slug per line)" value={lines(a.collectionSlugs)} error={err("collectionSlugs")} rows={2} onChange={(v) => set("collectionSlugs", fromLines(v))} />
            </div>
          </Panel>

          <Panel title="Pricing" sub="All-in prices in whole rupees / dirhams. Nothing is added after this.">
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyRow id="adult" label="Adult" value={a.price.adult} onChange={(v) => set("price", { ...a.price, adult: v ?? { inr: 0, aed: 0 } })} error={priceErr} />
              <MoneyRow id="child" label="Child" optional value={a.price.child} onChange={(v) => set("price", { ...a.price, child: v })} error={err("price.child")} />
              <MoneyRow id="infant" label="Infant" optional value={a.price.infant} onChange={(v) => set("price", { ...a.price, infant: v })} error={err("price.infant")} />
              <MoneyRow id="senior" label="Senior" optional value={a.price.senior} onChange={(v) => set("price", { ...a.price, senior: v })} error={err("price.senior")} />
              <MoneyRow id="compareAt" label="Compare-at (gate price)" optional value={a.price.compareAt} onChange={(v) => set("price", { ...a.price, compareAt: v })} error={err("price.compareAt")} />
              <Toggle id="quoteOnly" label="Quote only (no public price)" hint="Tier D — CTA becomes “Request a quote”" checked={Boolean(a.quoteOnly)} onChange={(v) => set("quoteOnly", v || undefined)} />
            </div>
          </Panel>

          <Panel title="Logistics">
            <div className="grid gap-4 sm:grid-cols-2">
              <Text id="durationMinutes" label="Duration (minutes)" type="number" required value={a.durationMinutes} error={err("durationMinutes")} onChange={(v) => set("durationMinutes", Number(v))} />
              <Text id="freeCancellationHours" label="Free cancellation until (hours before)" type="number" value={a.freeCancellationHours} error={err("freeCancellationHours")} hint="0 = non-refundable" onChange={(v) => set("freeCancellationHours", Number(v))} />
              <Text id="location" label="Location" required value={a.location} error={err("location")} onChange={(v) => set("location", v)} />
              <Text id="meetingPoint" label="Meeting point" required value={a.meetingPoint} error={err("meetingPoint")} onChange={(v) => set("meetingPoint", v)} />
              <Area id="timeSlots" label="Time slots (one per line)" value={lines(a.timeSlots)} error={err("timeSlots")} rows={3} onChange={(v) => set("timeSlots", fromLines(v))} />
              <Area id="pickupZones" label="Pickup zones (one per line)" value={lines(a.pickupZones)} error={err("pickupZones")} rows={3} onChange={(v) => set("pickupZones", fromLines(v))} />
              <Toggle id="pickupIncluded" label="Hotel pickup included" checked={a.pickupIncluded} onChange={(v) => set("pickupIncluded", v)} />
              <Toggle id="isPrivate" label="Private experience" checked={a.isPrivate} onChange={(v) => set("isPrivate", v)} />
              <Toggle id="mobileVoucher" label="Mobile voucher" checked={a.mobileVoucher} onChange={(v) => set("mobileVoucher", v)} />
              <FormField label="Supplier confirms" htmlFor="confirmation" error={err("confirmation")}>
                <select id="confirmation" value={a.confirmation} onChange={(e) => set("confirmation", e.target.value as ActivityInput["confirmation"])} className={INPUT_CLASS}>
                  <option value="manual">Manually (within 2 hours)</option>
                  <option value="instant">Instantly (API)</option>
                </select>
              </FormField>
              <Checks label="Dietary" options={DIETARY} value={a.dietary} onChange={(v) => set("dietary", v)} />
              <Checks label="Suitable for" options={SUITABILITY} value={a.suitability} onChange={(v) => set("suitability", v)} />
            </div>
          </Panel>

          <Panel title="Content">
            <div className="grid gap-4 sm:grid-cols-2">
              <Area id="inclusions" label="Inclusions / highlights (one per line)" required value={lines(a.inclusions)} error={err("inclusions")} rows={6} onChange={(v) => set("inclusions", fromLines(v))} />
              <Area id="exclusions" label="Exclusions (one per line)" value={lines(a.exclusions)} error={err("exclusions")} rows={6} onChange={(v) => set("exclusions", fromLines(v))} />
              <Area id="importantInfo" label="Important info / description (one point per line)" value={lines(a.importantInfo)} error={err("importantInfo")} rows={6} onChange={(v) => set("importantInfo", fromLines(v))} />
              <div className="space-y-4">
                <Area id="cancellationPolicy" label="Cancellation policy (plain English)" required value={a.cancellationPolicy} error={err("cancellationPolicy")} rows={3} onChange={(v) => set("cancellationPolicy", v)} />
                <Text id="mealNote" label="Meal note" value={a.mealNote ?? ""} error={err("mealNote")} onChange={(v) => set("mealNote", v || undefined)} />
              </div>
              <Area id="itinerary" label="Itinerary — one stop per line: time :: title :: detail [:: minutes]" value={structuredText.itinerary} error={err("itinerary")} rows={5} onChange={(v) => setStructuredText((s) => ({ ...s, itinerary: v }))} />
              <Area id="faqs" label="FAQ — one per line: question :: answer" value={structuredText.faqs} error={err("faqs")} rows={5} onChange={(v) => setStructuredText((s) => ({ ...s, faqs: v }))} />
            </div>
          </Panel>

          <Panel title="Options, upsells & cross-sells">
            <div className="grid gap-4 sm:grid-cols-2">
              <Area
                id="variants"
                label="Variants (JSON array)"
                value={structuredText.variants}
                error={jsonErrors.variants ?? err("variants")}
                rows={8}
                hint={'[{ "id": "standard", "name": "Standard", "blurb": "", "delta": { "inr": 0, "aed": 0 }, "highlights": [], "isPrivate": false, "recommended": true }]'}
                onChange={(v) => setStructuredText((s) => ({ ...s, variants: v }))}
              />
              <Area
                id="addOns"
                label="Add-ons / upsells (JSON array)"
                value={structuredText.addOns}
                error={jsonErrors.addOns ?? err("addOns")}
                rows={8}
                hint={`[{ "id": "photos", "name": "Photo package", "description": "", "price": { "inr": 900, "aed": 39 }, "perPerson": false, "category": "photo" }] — categories: ${ADDON_CATEGORIES.join(", ")}`}
                onChange={(v) => setStructuredText((s) => ({ ...s, addOns: v }))}
              />
              <Area id="relatedSlugs" label="Related activities (one slug per line)" value={lines(a.relatedSlugs)} error={err("relatedSlugs")} rows={3} onChange={(v) => set("relatedSlugs", fromLines(v))} />
              <Area id="comboSlugs" label="Cross-sell combos (one slug per line)" value={lines(a.comboSlugs)} error={err("comboSlugs")} rows={3} onChange={(v) => set("comboSlugs", fromLines(v))} />
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Images" sub="One per line: an https:// URL or img:activity:<slug>:<n> (Pexels-backed).">
            <Area id="images" label="Image list" required value={lines(a.images)} error={err("images")} rows={5} onChange={(v) => set("images", fromLines(v))} />
            <Text id="imageAlt" label="Alt text" required value={a.imageAlt} error={err("imageAlt")} onChange={(v) => set("imageAlt", v)} className="mt-3" />
            <Text id="video" label="Video URL" value={a.video ?? ""} error={err("video")} onChange={(v) => set("video", v || undefined)} className="mt-3" />
            {a.images[0] && (
              <img src={a.images[0].startsWith("img:") ? `/api/images/${a.images[0].split(":").slice(1, 3).join("/")}/${a.images[0].split(":")[3] ?? 0}?w=480` : a.images[0]} alt="" className="mt-3 aspect-[1/0.65] w-full rounded-[var(--radius-control)] border border-ink-200 object-cover" loading="lazy" />
            )}
          </Panel>

          <Panel title="SEO">
            <div className="space-y-3">
              <Text id="seoTitle" label="Meta title" required value={a.seo.title} error={err("seo.title")} onChange={(v) => set("seo", { ...a.seo, title: v })} />
              <Area id="seoDescription" label="Meta description" required value={a.seo.description} error={err("seo.description")} rows={3} onChange={(v) => set("seo", { ...a.seo, description: v })} />
              <Area id="seoKeywords" label="Keywords (one per line)" value={lines(a.seo.keywords)} error={err("seo.keywords")} rows={3} onChange={(v) => set("seo", { ...a.seo, keywords: fromLines(v) })} />
            </div>
          </Panel>

          <Panel title="Badges">
            <div className="grid gap-2">
              {(["bestseller", "newlyAdded", "editorPick", "sellingFast"] as const).map((b) => (
                <Toggle key={b} id={`badge-${b}`} label={b} checked={Boolean(a.badges[b])} onChange={(v) => set("badges", { ...a.badges, [b]: v || undefined })} />
              ))}
            </div>
          </Panel>

          <Panel title="Supplier" sub="Ops-only; never shown publicly.">
            <div className="space-y-3">
              <Text id="supplierName" label="Supplier name" required value={a.supplier.name} error={err("supplier.name")} onChange={(v) => set("supplier", { ...a.supplier, name: v, id: slugify(v) || a.supplier.id })} />
              <FormField label="Source" htmlFor="supplierSource" error={err("supplier.source")}>
                <select id="supplierSource" value={a.supplier.source} onChange={(e) => set("supplier", { ...a.supplier, source: e.target.value as ActivityInput["supplier"]["source"] })} className={INPUT_CLASS}>
                  <option value="direct">Direct contract</option>
                  <option value="portal">Official trade portal</option>
                  <option value="rayna">API aggregator</option>
                </select>
              </FormField>
              <Text id="supplierReliability" label="Reliability (0–100)" type="number" value={a.supplier.reliability} error={err("supplier.reliability")} onChange={(v) => set("supplier", { ...a.supplier, reliability: Number(v) })} />
              <Text id="supplierSince" label="Verified since (YYYY or YYYY-MM)" value={a.supplier.verifiedSince} error={err("supplier.verifiedSince")} onChange={(v) => set("supplier", { ...a.supplier, verifiedSince: v })} />
            </div>
          </Panel>

          <Panel title="Change note">
            <FormField label="Reason (kept in the version history)" htmlFor="reason">
              <input id="reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={INPUT_CLASS} placeholder="e.g. Supplier raised the price for winter" />
            </FormField>
          </Panel>

          {props.versions && props.versions.length > 0 && props.id && (
            <Panel title="Version history" sub="Restoring writes a new version equal to the old one — nothing is lost.">
              <ol className="divide-y divide-ink-200 text-sm">
                {props.versions.slice(0, 15).map((v) => (
                  <li key={v.version} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">
                        v{v.version} <StatusPill tone={v.status === "published" ? "success" : "neutral"}>{v.status}</StatusPill>
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {fmtDateTime(v.createdAt)}
                        {v.reason ? ` · ${v.reason}` : ""}
                      </p>
                    </div>
                    {v.version !== props.version && (
                      <button
                        type="submit"
                        formAction={restoreAction}
                        name="version"
                        value={String(v.version)}
                        disabled={restorePending}
                        className="shrink-0 text-xs font-semibold text-sun-700 underline disabled:opacity-50"
                      >
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              {restoreState && !restoreState.ok && <p className="mt-2 text-xs font-semibold text-[var(--color-danger)]">{restoreState.message}</p>}
            </Panel>
          )}
        </div>
      </div>
    </form>
  );
}

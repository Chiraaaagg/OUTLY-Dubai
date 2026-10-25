"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { IMPORT_DERIVED, IMPORT_FIELDS, IMPORT_REQUIRED, IMPORT_REQUIRED_ONE_OF, type ImportField } from "@/server/schemas/activity.schema";
import { FormField, INPUT_CLASS, Panel, StatusPill } from "../../_components/ui";

/**
 * Import wizard: source → (mapping) → preview → apply. Talks to the JSON
 * routes under /api/admin/imports with the session cookie; the routes
 * re-check permission, same-origin and the 20/hour budget.
 */

type Source = "csv" | "sheet" | "doc" | "bulk";
type Mapping = Partial<Record<ImportField, string | null>>;

interface PreviewRow {
  row: number;
  slug: string;
  title: string;
  action: "create" | "update";
  ok: boolean;
  errors: { row: number; field: string; message: string; cell?: string }[];
  warnings: { field: string; message: string; review?: boolean }[];
  raw?: Record<string, string>;
  missingCategory?: string;
  review?: boolean;
}

interface Preview {
  batchId: string;
  source: Source;
  headers: string[];
  mapping: Mapping;
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  rows: PreviewRow[];
  warnings: string[];
  missingCategories?: string[];
}

interface FetchResult {
  kind: "sheet" | "doc";
  headers?: string[];
  sample?: string[][];
  rows?: number;
  mapping?: Mapping;
  warnings?: string[];
  sections?: string[];
  notes?: string[];
}

interface Applied {
  batchId: string;
  applied: number;
  created: number;
  updated: number;
  published: number;
  heldForReview?: string[];
}

const ONE_OF = new Set(IMPORT_REQUIRED_ONE_OF.flat());
const requiredMark = (f: ImportField) => (IMPORT_REQUIRED.includes(f) ? "*" : ONE_OF.has(f) ? "†" : "");

interface ApiError {
  error: { code: string; message: string; recovery?: string; details?: { fields?: Record<string, string> } };
}

async function api<T>(path: string, init: RequestInit, timeoutMs = 240_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", signal: controller.signal, ...init });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`No response after ${Math.round(timeoutMs / 1000)} s, the server is still working or the connection dropped. Check the batch history below before retrying.`);
    throw new Error("Network error, check your connection and try again");
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const e = data as ApiError | null;
    if (e?.error?.code === "PAYLOAD_TOO_LARGE") throw new Error("The file or pasted data is too large for one import — split it into smaller files (CSV uploads are limited to 5 MB).");
    const fields = e?.error?.details?.fields;
    const detail = fields ? `, ${Object.entries(fields).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join("; ")}` : "";
    throw new Error((e?.error?.message ?? `Request failed (${res.status})`) + detail);
  }
  return data as T;
}

const SOURCES: { key: Source; label: string; blurb: string }[] = [
  { key: "csv", label: "CSV file", blurb: "Upload a .csv. Download the template to see every column." },
  { key: "sheet", label: "Google Sheet", blurb: "Paste the sheet link (shared as “Anyone with the link”). Map columns, preview, import." },
  { key: "doc", label: "Google Doc", blurb: "Paste a doc link or the text. Headings like Inclusions / Price / FAQ become fields. Creates one draft." },
  { key: "bulk", label: "Bulk JSON", blurb: "Paste a JSON array of activities to create or update many at once." },
];

export function ImportWizard({ canPublish }: { canPublish: boolean }) {
  const router = useRouter();
  const [source, setSource] = useState<Source>("csv");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fetched, setFetched] = useState<FetchResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"fetch" | "preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [publish, setPublish] = useState(false);
  const [createCats, setCreateCats] = useState(true);
  const [applied, setApplied] = useState<Applied | null>(null);

  const reset = () => {
    setFetched(null);
    setPreview(null);
    setApplied(null);
    setError(null);
    setMapping({});
  };

  const fetchSource = async () => {
    setBusy("fetch");
    setError(null);
    try {
      const r = await api<FetchResult>("/api/admin/imports/fetch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      setFetched(r);
      if (r.mapping) setMapping(r.mapping);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch");
    } finally {
      setBusy(null);
    }
  };

  const runPreview = async () => {
    setBusy("preview");
    setError(null);
    setApplied(null);
    try {
      let p: Preview;
      if (source === "csv") {
        if (!file) throw new Error("Choose a CSV file first");
        const fd = new FormData();
        fd.set("file", file);
        if (Object.keys(mapping).length) fd.set("mapping", JSON.stringify(mapping));
        p = await api<Preview>("/api/admin/imports/preview", { method: "POST", body: fd });
      } else if (source === "sheet") {
        p = await api<Preview>("/api/admin/imports/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, url, mapping: Object.keys(mapping).length ? mapping : undefined }) });
      } else if (source === "doc") {
        p = await api<Preview>("/api/admin/imports/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, ...(url ? { url } : {}), ...(text ? { text } : {}) }) });
      } else {
        let items: unknown;
        try {
          items = JSON.parse(text);
        } catch {
          throw new Error("Bulk import needs a valid JSON array");
        }
        p = await api<Preview>("/api/admin/imports/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, items }) });
      }
      setPreview(p);
      setMapping(p.mapping);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy("apply");
    setError(null);
    try {
      const r = await api<Applied>(`/api/admin/imports/${preview.batchId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partial, publish: publish && canPublish, createMissingCategories: createCats && (preview.missingCategories?.length ?? 0) > 0 }),
      });
      setApplied(r);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(null);
    }
  };

  const showMapping = (source === "csv" || source === "sheet") && (fetched?.headers?.length || preview?.headers.length);
  const headers = preview?.headers ?? fetched?.headers ?? [];

  return (
    <div className="space-y-4">
      <details className="rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4 text-sm text-ink-700">
        <summary className="cursor-pointer font-semibold text-ink-900">Column reference, what each value should look like</summary>
        <p className="mt-2">
          A <b>new</b> listing needs: <span className="font-mono text-xs">{IMPORT_REQUIRED.join(", ")}</span>, and one of <span className="font-mono text-xs">{IMPORT_REQUIRED_ONE_OF.map((g) => g.join(" / ")).join("; ")}</span>. These are never filled in for you: a blank one is an error on that row. A row whose slug already exists <b>updates</b> that listing and only changes the cells it fills; blank or unmapped cells keep the current value.
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          <li><b>tier</b>: A–E (A attractions/tickets, B tours, C combos, D luxury, E transfers). <i>Tier B</i>, <i>C - Combos</i>, <i>luxury</i> are read; anything else is an error.</li>
          <li><b>categorySlug</b>: one of the slugs on the Categories page. Common supplier names (dhow-cruise, water-parks, city-tours…) are mapped; a guess from the title alone is held for review.</li>
          <li><b>prices</b>: one amount per cell, ₹ / Rs / AED / commas / “From” / “/-” are fine; decimals are rounded. Column names may carry the currency: <i>Selling Price (AED)</i>. INR and AED are both required; one is never converted from the other.</li>
          <li><b>durationMinutes</b>: minutes, “2h 30m”, “1:30”, or hours if the column says so (<i>Duration (hours)</i>). Words like “Half day” are kept as important info; blank = “not stated”.</li>
          <li><b>cancellationPolicy / freeCancellationHours</b>: fill either; the other is read from it. A policy with no hours in it needs the hours column.</li>
          <li><b>confirmation</b>: <i>instant</i> or <i>manual</i> (“Instant Confirmation” → instant; “On request / within 24h” → manual).</li>
          <li><b>dietary / suitability</b>: veg, jain, halal, non-veg / kids, seniors, wheelchair, infant, couples, groups; free text is scanned, the rest is kept as meal note / important info.</li>
          <li><b>lists</b> (inclusions, exclusions, importantInfo, images, timeSlots, pickupZones, keywords): items separated by <code>|</code> or new lines.</li>
          <li><b>yes/no</b> columns: yes/no, true/false, 1/0; “Yes, from Deira hotels” keeps the remark as important info.</li>
          <li><b>faqs / itinerary / variants / addOns</b>: <code>Question? :: Answer | …</code>, <code>09:00 :: Title :: detail | …</code>, or JSON arrays (the template uses JSON).</li>
          <li><b>Filled in when blank</b> (shown as a note; ⚑ = held back from “publish immediately” until checked): {Object.entries(IMPORT_DERIVED).map(([f, d]) => `${f} ← ${d!.from}${d!.review ? " ⚑" : ""}`).join("; ")}.</li>
        </ul>
      </details>

      <Panel title="1. Source">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setSource(s.key);
                reset();
              }}
              aria-pressed={source === s.key}
              className={`rounded-[var(--radius-control)] border p-3 text-left ${source === s.key ? "border-sun-500 bg-sun-50" : "border-ink-200 bg-paper hover:border-ink-400"}`}
            >
              <p className="font-semibold text-ink-900">{s.label}</p>
              <p className="mt-0.5 text-xs text-ink-600">{s.blurb}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          {source === "csv" && (
            <FormField
              label="CSV file"
              htmlFor="csv-file"
              hint={
                <>
                  <a href="/api/admin/imports/export?template=blank" className="underline">Blank template</a> (every column) ·{" "}
                  <a href="/api/admin/imports/export" className="underline">Current catalogue as CSV</a> (edit and re-upload to update)
                </>
              }
            >
              <input
                id="csv-file"
                type="file"
                accept=".csv,.tsv,.txt,text/csv"
                onChange={(e) => {
                  // A mapping belongs to the file it was made for; carrying it to a new file hides that file's columns.
                  setFile(e.target.files?.[0] ?? null);
                  setMapping({});
                  setPreview(null);
                  setApplied(null);
                }}
                className={`${INPUT_CLASS} py-2`}
              />
            </FormField>
          )}
          {(source === "sheet" || source === "doc") && (
            <FormField label={source === "sheet" ? "Google Sheet link" : "Google Doc link (or paste text below)"} htmlFor="g-url" hint="Share → Anyone with the link → Viewer. Only docs.google.com links are accepted.">
              <input
                id="g-url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setFetched(null);
                  setMapping({});
                  setPreview(null);
                  setApplied(null);
                }}
                placeholder="https://docs.google.com/…"
                className={INPUT_CLASS}
              />
            </FormField>
          )}
          {source === "sheet" && (
            <Button type="button" variant="outline" onClick={fetchSource} loading={busy === "fetch"} loadingLabel="Fetching…" disabled={!url}>
              Fetch columns
            </Button>
          )}
          {source === "doc" && (
            <Button type="button" variant="outline" onClick={fetchSource} loading={busy === "fetch"} loadingLabel="Fetching…" disabled={!url}>
              Fetch doc
            </Button>
          )}
        </div>
        {(source === "doc" || source === "bulk") && (
          <FormField label={source === "doc" ? "Or paste the document text" : "JSON array of activities"} htmlFor="paste" className="mt-3">
            <textarea id="paste" value={text} onChange={(e) => setText(e.target.value)} rows={8} className={`${INPUT_CLASS} min-h-0 py-2 font-mono text-sm`} placeholder={source === "doc" ? "Title: …\nCategory: …\nPrice: …\nInclusions\n- …" : '[{ "slug": "…", "title": "…", … }]'} />
          </FormField>
        )}
        {fetched?.kind === "doc" && (
          <div className="mt-3 text-sm text-ink-700">
            <p>
              Sections found: <span className="font-mono text-xs">{fetched.sections?.join(", ") || "none"}</span>
            </p>
            {fetched.warnings?.map((w) => (
              <p key={w} className="text-[var(--color-warning)]">
                {w}
              </p>
            ))}
          </div>
        )}
      </Panel>

      {showMapping ? (
        <Panel title="2. Map columns" sub="Auto-matched from the header row; adjust anything that looks wrong. Required fields are marked.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <span className={`w-40 shrink-0 truncate font-mono text-xs ${requiredMark(f) ? "font-bold text-ink-900" : "text-ink-600"}`} title={f}>
                  {f}
                  {requiredMark(f)}
                </span>
                <select value={mapping[f] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || null }))} className={`${INPUT_CLASS} min-h-9 text-sm`}>
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-500">* required for a new listing · † fill at least one of the pair</p>
          {fetched?.notes?.map((n) => (
            <p key={n} className="mt-1 text-xs text-ink-600">
              {n}
            </p>
          ))}
          {fetched?.sample && (
            <p className="mt-3 text-xs text-ink-500">
              {fetched.rows} rows found. First row: <span className="font-mono">{fetched.sample[0]?.slice(0, 6).join(" | ")}</span>
            </p>
          )}
        </Panel>
      ) : null}

      <Panel title={showMapping ? "3. Preview" : "2. Preview"} sub="Every row is validated against the same rules as the manual form. Nothing is written yet.">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={runPreview} loading={busy === "preview"} loadingLabel="Validating…" disabled={(source === "csv" && !file) || ((source === "sheet") && !url) || (source === "doc" && !url && !text) || (source === "bulk" && !text)}>
            {preview ? "Re-run preview" : "Preview"}
          </Button>
          {preview && (
            <>
              <StatusPill tone="success">{preview.rowsOk} ok</StatusPill>
              {preview.rowsFailed > 0 && <StatusPill tone="danger">{preview.rowsFailed} with errors</StatusPill>}
              {preview.rows.some((r) => r.warnings?.length) && <StatusPill tone="warning">{preview.rows.filter((r) => r.warnings?.length).length} with notes</StatusPill>}
              {preview.rows.some((r) => r.ok && r.review) && <StatusPill tone="warning">{preview.rows.filter((r) => r.ok && r.review).length} to check before publishing</StatusPill>}
              <span className="text-xs text-ink-500">batch {preview.batchId.slice(0, 8)}</span>
            </>
          )}
        </div>
        {error && (
          <Alert tone="danger" title={error} className="mt-3" />
        )}
        {preview?.warnings.map((w) => (
          <p key={w} className="mt-2 text-sm text-[var(--color-warning)]">
            {w}
          </p>
        ))}
        {preview && (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius-card)] border border-ink-200">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-shell/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-600">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row} className="border-t border-ink-200 align-top">
                    <td className="px-3 py-2 tnum">{r.row}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.slug || "—"}</td>
                    <td className="px-3 py-2">{r.title || "—"}</td>
                    <td className="px-3 py-2">
                      <StatusPill tone={r.action === "create" ? "accent" : "info"}>{r.action}</StatusPill>
                    </td>
                    <td className="px-3 py-2">
                      {r.ok ? <StatusPill tone="success">valid</StatusPill> : null}
                      {r.ok && r.review ? (
                        <StatusPill tone="warning" className="ml-1">
                          check first
                        </StatusPill>
                      ) : null}
                      {!r.ok && (
                        <ul className="space-y-0.5 text-xs text-[var(--color-danger)]">
                          {r.errors.map((e, i) => (
                            <li key={i}>
                              <span className="font-mono">{e.field}</span>: {e.message}
                              {e.cell !== undefined ? <span className="ml-1 text-ink-500">(cell: “{e.cell.slice(0, 80)}”)</span> : r.raw && r.raw[e.field] !== undefined && <span className="ml-1 text-ink-500">(cell: “{r.raw[e.field].slice(0, 80)}”)</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.warnings?.length > 0 && (
                        <details className="mt-1 text-xs text-ink-600">
                          <summary className="cursor-pointer select-none">
                            {r.warnings.length} note{r.warnings.length === 1 ? "" : "s"}, values normalised or derived
                          </summary>
                          <ul className="mt-1 space-y-0.5">
                            {r.warnings.map((w, i) => (
                              <li key={i} className={w.review ? "font-semibold text-[var(--color-warning)]" : undefined}>
                                {w.review ? "⚑ " : ""}
                                <span className="font-mono">{w.field}</span>: {w.message}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {preview && (
        <Panel title={showMapping ? "4. Apply" : "3. Apply"} sub="All-or-nothing by default: one bad row and nothing changes. Reversible from the batch page.">
          <div className="flex flex-wrap items-center gap-4">
            {(preview.missingCategories?.length ?? 0) > 0 && (
              <label className="inline-flex items-center gap-2 text-sm text-ink-800">
                <input type="checkbox" checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} className="h-4 w-4" /> Create the {preview.missingCategories!.length} missing categor{preview.missingCategories!.length === 1 ? "y" : "ies"} as drafts (<span className="font-mono text-xs">{preview.missingCategories!.join(", ")}</span>) and import those rows
              </label>
            )}
            {preview.rowsFailed > 0 && (
              <label className="inline-flex items-center gap-2 text-sm text-ink-800">
                <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="h-4 w-4" /> Skip the remaining failed rows and import the rest
              </label>
            )}
            {canPublish && (
              <label className="inline-flex items-center gap-2 text-sm text-ink-800">
                <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4" /> Publish every listing in this batch immediately, new <em>and</em> updated (otherwise they stay drafts). Rows marked “check first” stay drafts.
              </label>
            )}
            <Button
              type="button"
              onClick={apply}
              loading={busy === "apply"}
              loadingLabel="Importing… (one transaction, up to a few minutes for hundreds of rows)"
              disabled={Boolean(applied) || (preview.rowsOk === 0 && !(createCats && (preview.missingCategories?.length ?? 0) > 0)) || (preview.rowsFailed > 0 && !partial && !(createCats && preview.rows.every((r) => r.ok || r.missingCategory)))}
            >
              Import {partial ? "valid" : "all"} rows
            </Button>
          </div>
          {applied && (
            <Alert tone="success" title={`Imported ${applied.applied} listings (${applied.created} new, ${applied.updated} updated)`} className="mt-3">
              <p>
                <a href={`/admin/imports/${applied.batchId}`} className="underline">
                  Open the batch
                </a>{" "}
                to review or revert.{" "}
                {applied.published > 0 ? (
                  <>
                    {applied.published} are <strong>live now</strong>. Check that their categories are published too, or the category pages will be missing.
                    {(applied.heldForReview?.length ?? 0) > 0 && (
                      <>
                        {" "}
                        {applied.heldForReview!.length} stayed drafts because a derived value needs checking: <span className="font-mono text-xs">{applied.heldForReview!.join(", ")}</span>.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    They are drafts —{" "}
                    <a href="/admin/activities?status=draft" className="underline">
                      select them all on Activities
                    </a>{" "}
                    and publish in one go.
                  </>
                )}
              </p>
            </Alert>
          )}
        </Panel>
      )}
    </div>
  );
}

import { Errors } from "../lib/errors";

/**
 * Google Sheet / Doc link → its CSV / text export URL. Pure (no fetch) so the
 * accepted link shapes are unit-tested; `import.service` does the fetch.
 * Only https://docs.google.com is accepted (SSRF), with the hints an operator
 * needs when they paste a Drive or wrong-kind link.
 */
export function googleExportUrl(raw: string, kind: "sheet" | "doc"): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Errors.validation({ url: "Not a valid URL" });
  }
  if (url.protocol === "https:" && url.hostname === "drive.google.com") {
    throw Errors.validation({ url: "This is a Drive link. Open the file in Google Sheets/Docs and paste the docs.google.com link (an uploaded .xlsx must be saved as a Google Sheet first)" });
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw Errors.validation({ url: "Only https://docs.google.com links are accepted" });
  // Signed into several Google accounts, the browser adds /u/<n>/ ("…/spreadsheets/u/1/d/<id>/edit").
  const path = url.pathname.replace(/^\/(spreadsheets|document)\/u\/\d+\//, "/$1/");
  // "Publish to the web" links carry a different id namespace (/d/e/2PACX-…) and export through /pub.
  const published = /^\/(spreadsheets|document)\/d\/e\/([a-zA-Z0-9_-]{20,})/.exec(path);
  const m = published ? null : /^\/(spreadsheets|document)\/d\/([a-zA-Z0-9_-]{10,})/.exec(path);
  const found = published ?? m;
  if (!found) {
    if (/^\/file\/d\//.test(path)) {
      throw Errors.validation({ url: "This is a Drive file link. Open the file in Google Sheets/Docs (File → Save as Google Sheets) and paste that link" });
    }
    throw Errors.validation({ url: kind === "sheet" ? "Paste the Google Sheet link (…/spreadsheets/d/<id>/…)" : "Paste the Google Doc link (…/document/d/<id>/…)" });
  }
  if (kind === "sheet" && found[1] !== "spreadsheets") throw Errors.validation({ url: "This is a Google Doc link — use the Doc import" });
  if (kind === "doc" && found[1] !== "document") throw Errors.validation({ url: "This is a Google Sheet link — use the Sheet import" });
  const id = found[2];
  // Only forward a gid the operator's link actually names. Google answers 400
  // for a gid that does not exist in the file, and "0" is not guaranteed to
  // exist (any recreated first tab gets a random gid); omitted = first tab.
  const gid = url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1] ?? null;
  const gidParam = gid && /^\d{1,12}$/.test(gid) ? `&gid=${gid}` : "";
  if (kind === "sheet") {
    return published ? `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv${gidParam}` : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gidParam}`;
  }
  return published ? `https://docs.google.com/document/d/e/${id}/pub?output=txt` : `https://docs.google.com/document/d/${id}/export?format=txt`;
}

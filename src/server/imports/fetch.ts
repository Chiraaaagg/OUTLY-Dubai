import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Errors, isAppError } from "../lib/errors";

/**
 * Fetch a Google Sheets / Docs export (SSRF-hardened).
 *
 * Redirects are followed by hand, never by `fetch` itself, so every hop is
 * checked BEFORE a connection is made to it:
 *   - https only, default port (443), no user:password in the URL;
 *   - the host is a hostname (never an IP literal) on a short allowlist;
 *   - optionally, the host's DNS answers must all be public addresses;
 *   - at most MAX_REDIRECTS hops, no loops, relative `Location` resolved
 *     against the hop that sent it.
 * One deadline covers every hop and the body. The body is streamed with a
 * byte ceiling that holds whatever `Content-Length` says (or omits), and must
 * be UTF-8 text, not a web page.
 *
 * Allowlist (only what an export actually touches):
 *   docs.google.com — the export endpoints `googleExportUrl` builds
 *     (`/spreadsheets/d/<id>/export?format=csv`, `/document/d/<id>/export?format=txt`,
 *     and the "publish to the web" `/pub?output=…` forms), plus Google's own
 *     redirects within it (e.g. into `/u/<n>/` paths).
 *   doc-<a>-<b>-sheets.googleusercontent.com / doc-<a>-<b>-docs.googleusercontent.com —
 *     the per-request export hosts Google redirects the CSV / TXT download to.
 *     The pattern is pinned to that shape, not `*.googleusercontent.com`, which
 *     also serves arbitrary user content (sites, Apps Script, image proxies).
 * accounts.google.com is recognised but never fetched: a redirect there means
 * the file is not shared publicly, and is reported as such.
 */

export const EXPORT_MAX_BYTES = 5 * 1024 * 1024;
export const EXPORT_TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 5;

const EXPORT_HOST = /^doc-[0-9a-z]{1,4}-[0-9a-z]{1,4}-(?:sheets|docs)\.googleusercontent\.com$/;
const SIGN_IN_HOST = "accounts.google.com";
const REDIRECT = new Set([301, 302, 303, 307, 308]);
const TEXT_TYPES = new Set(["text/csv", "text/plain", "text/tab-separated-values"]);

export type LookupFn = (hostname: string) => Promise<string[]>;

export interface ExportFetchDeps {
  /** Defaults to the global `fetch`. Called with `redirect: "manual"` only. */
  fetch?: typeof fetch;
  /** DNS answers for a hostname; every address must be public. `null` skips the check. Defaults to the system resolver. */
  lookup?: LookupFn | null;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const systemLookup: LookupFn = async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

const fail = (message: string) => Errors.validation({ url: message });

export function isAllowedExportHost(hostname: string): boolean {
  return hostname === "docs.google.com" || EXPORT_HOST.test(hostname);
}

/** Loopback, private, link-local, CGNAT, unique-local, multicast, reserved — and IPv4 embedded in IPv6 of the same. Anything unparseable counts as private. */
export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    // IPv4-mapped / -compatible: ::ffff:a.b.c.d, ::a.b.c.d, ::ffff:7f00:1
    const dotted = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hex) {
      const hi = Number.parseInt(hex[1], 16);
      const lo = Number.parseInt(hex[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = Number.parseInt(lower.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8:");
  }
  return true;
}

/** Reject with an AbortError as soon as `signal` aborts, whatever `promise` is doing (a resolver or a mocked stream may ignore the signal). */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("The operation was aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/** Throws unless `url` is a hop this fetch may connect to. */
function checkHop(url: URL): void {
  if (url.protocol !== "https:") throw fail("Google redirected somewhere unexpected — check the link");
  if (url.port !== "" && url.port !== "443") throw fail("Google redirected somewhere unexpected — check the link");
  if (url.username || url.password) throw fail("Google redirected somewhere unexpected — check the link");
  const host = url.hostname;
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0) throw fail("Google redirected somewhere unexpected — check the link");
  if (!isAllowedExportHost(host)) throw fail("Google redirected somewhere unexpected — check the link");
}

async function checkDns(hostname: string, lookup: LookupFn, signal: AbortSignal): Promise<void> {
  let addresses: string[];
  try {
    addresses = await abortable(lookup(hostname), signal);
  } catch (error) {
    if (signal.aborted) throw error;
    throw fail("Could not reach Google — try again");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw fail("Google redirected somewhere unexpected — check the link");
}

function statusError(status: number, startUrl: string) {
  if (status === 401 || status === 403) return fail("Google refused access — share the file as “Anyone with the link → Viewer” and try again");
  if (status === 400) {
    return fail(/gid=/.test(startUrl) ? "Google returned 400 — the tab (gid) in this link does not exist in the sheet. Copy the link from the tab you want, or paste the link without #gid=…" : "Google returned 400 — this file cannot be exported. If it is an uploaded .xlsx, open it and use File → Save as Google Sheets, then share that");
  }
  if (status === 404) return fail("Google returned 404 — the file does not exist or is not shared with “Anyone with the link”");
  return fail(`Google returned ${status} — check the link is correct and shared`);
}

async function readCapped(res: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  const declared = res.headers.get("content-length");
  if (declared !== null && declared.trim() !== "" && Number(declared) > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw fail("File is larger than 5 MB");
  }
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await abortable(reader.read(), signal);
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    }
    const { done, value } = chunk;
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw fail("File is larger than 5 MB");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** GET a Google export URL (from `googleExportUrl`) and return its text. Errors are 422s carrying an operator-readable `url` message. */
export async function fetchGoogleExport(startUrl: string, deps: ExportFetchDeps = {}): Promise<string> {
  const doFetch = deps.fetch ?? fetch;
  const lookup = deps.lookup === undefined ? systemLookup : deps.lookup;
  const maxBytes = deps.maxBytes ?? EXPORT_MAX_BYTES;
  const maxRedirects = deps.maxRedirects ?? MAX_REDIRECTS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? EXPORT_TIMEOUT_MS);
  const seen = new Set<string>();
  try {
    let url: URL;
    try {
      url = new URL(startUrl);
    } catch {
      throw fail("Not a valid URL");
    }
    for (let hop = 0; ; hop++) {
      checkHop(url);
      if (seen.has(url.href)) throw fail("Google redirected in a loop — try again later");
      seen.add(url.href);
      if (lookup) await checkDns(url.hostname, lookup, controller.signal);

      const res = await abortable(doFetch(url.href, { method: "GET", redirect: "manual", signal: controller.signal, cache: "no-store", credentials: "omit", headers: { accept: "text/csv,text/plain;q=0.9,*/*;q=0.1" } }), controller.signal);

      if (REDIRECT.has(res.status)) {
        await res.body?.cancel().catch(() => {});
        const location = res.headers.get("location");
        if (!location) throw fail("Google redirected somewhere unexpected — check the link");
        if (hop >= maxRedirects) throw fail("Google redirected too many times — try again later");
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw fail("Google redirected somewhere unexpected — check the link");
        }
        // A redirect to the sign-in page means the file is private; it is reported, never followed.
        if (next.protocol === "https:" && next.hostname === SIGN_IN_HOST) throw statusError(403, startUrl);
        url = next;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw statusError(res.status, startUrl);
      }

      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (type === "text/html" || type === "application/xhtml+xml") {
        await res.body?.cancel().catch(() => {});
        throw fail("Google returned a web page instead of the file — it is probably not shared publicly");
      }
      if (type && !TEXT_TYPES.has(type)) {
        await res.body?.cancel().catch(() => {});
        throw fail(`Google returned ${type.slice(0, 60)}, not a CSV or text export — check the link`);
      }
      const bytes = await readCapped(res, maxBytes, controller.signal);
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
      } catch {
        throw fail("Google's export is not valid UTF-8 text — check the link points to a Sheet or Doc");
      }
      if (/<html|<!doctype html/i.test(text.slice(0, 500))) throw fail("Google returned a web page instead of the file — it is probably not shared publicly");
      return text;
    }
  } catch (error) {
    if (isAppError(error)) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw fail("Google took too long to respond — try again");
    // A network failure or a stream that broke off mid-body.
    throw fail("Could not read the file from Google — try again");
  } finally {
    clearTimeout(timer);
  }
}

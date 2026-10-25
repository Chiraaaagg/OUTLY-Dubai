import { describe, expect, it } from "vitest";
import { fetchGoogleExport, isAllowedExportHost, isPrivateAddress, type LookupFn } from "../fetch";
import { googleExportUrl } from "../google";

/**
 * H05 — Google export fetch: every redirect hop is validated before it is
 * connected to. MOCKED: `fetch` and DNS are injected fakes; nothing here
 * touches the network. A "connection" is a call to the fake fetch, so
 * "never connected" means the fake never saw that URL.
 */

const SHEET = googleExportUrl("https://docs.google.com/spreadsheets/d/abcdefghij1234567890/edit#gid=0", "sheet");
const EXPORT_HOST = "https://doc-0s-4g-sheets.googleusercontent.com/export/abc/def?format=csv";
const publicDns: LookupFn = async () => ["142.250.183.110"];

type Route = (url: string, init: RequestInit) => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init?.redirect).toBe("manual");
    const route = routes[url];
    if (!route) throw new Error(`unexpected connection to ${url}`);
    return route(url, init ?? {});
  }) as typeof fetch;
  return { fn, calls };
}

const csv = (body: string | Uint8Array, headers: Record<string, string> = { "content-type": "text/csv; charset=utf-8" }) => () => new Response(body as BodyInit, { status: 200, headers });
const redirect = (location: string, status = 302) => () => new Response(null, { status, headers: { location } });

function stream(chunks: Uint8Array[], opts: { hang?: boolean; error?: boolean } = {}): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else if (opts.error) controller.error(new TypeError("terminated"));
      else if (!opts.hang) controller.close();
      // hang: never enqueue or close — only the deadline ends the read.
    },
  });
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const err = (await p.then(
    () => {
      throw new Error("expected a refusal");
    },
    (e: unknown) => e,
  )) as { code?: string; details?: { fields?: { url?: string } } };
  expect(err.code).toBe("VALIDATION_FAILED");
  return err.details?.fields?.url ?? "";
}

describe("fetchGoogleExport (mocked fetch + DNS)", () => {
  it("fetches an allowed export directly", async () => {
    const { fn, calls } = fakeFetch({ [SHEET]: csv("﻿slug,title\na,b\n") });
    await expect(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns })).resolves.toBe("slug,title\na,b\n");
    expect(calls).toEqual([SHEET]);
  });

  it("follows Google's real redirect shape: docs.google.com → doc-…-sheets.googleusercontent.com", async () => {
    const { fn, calls } = fakeFetch({ [SHEET]: redirect(EXPORT_HOST, 307), [EXPORT_HOST]: csv("slug\nx\n") });
    await expect(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns })).resolves.toBe("slug\nx\n");
    expect(calls).toEqual([SHEET, EXPORT_HOST]);
  });

  it("resolves a relative Location against the hop that sent it", async () => {
    const next = "https://docs.google.com/spreadsheets/u/0/d/abcdefghij1234567890/export?format=csv";
    const { fn, calls } = fakeFetch({ [SHEET]: redirect("/spreadsheets/u/0/d/abcdefghij1234567890/export?format=csv"), [next]: csv("a\n1\n") });
    await expect(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns })).resolves.toBe("a\n1\n");
    expect(calls).toEqual([SHEET, next]);
  });

  it.each([
    ["a foreign host", "https://evil.example.com/x.csv"],
    ["a lookalike host", "https://docs.google.com.evil.example/x.csv"],
    ["arbitrary googleusercontent content", "https://lh3.googleusercontent.com/x"],
    ["plain http", "http://doc-0s-4g-sheets.googleusercontent.com/export"],
    ["an odd port", "https://docs.google.com:8443/export"],
    ["credentials in the URL", "https://user:pw@docs.google.com/export"],
    ["an IPv4 literal", "https://127.0.0.1/export"],
    ["an IPv6 literal", "https://[::1]/export"],
    ["a metadata address", "https://169.254.169.254/latest/meta-data/"],
    ["a non-web scheme", "file:///etc/passwd"],
  ])("refuses a redirect to %s without connecting to it", async (_label, location) => {
    const { fn, calls } = fakeFetch({ [SHEET]: redirect(location) });
    const msg = await refusal(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns }));
    expect(msg).toMatch(/redirected somewhere unexpected/);
    expect(calls).toEqual([SHEET]);
  });

  it("reports a redirect to the Google sign-in page as 'not shared', without following it", async () => {
    const { fn, calls } = fakeFetch({ [SHEET]: redirect("https://accounts.google.com/ServiceLogin?continue=x") });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns }))).toMatch(/refused access/);
    expect(calls).toEqual([SHEET]);
  });

  it("refuses an allowed hostname whose DNS answer is private, before connecting", async () => {
    const lookup: LookupFn = async (h) => (h === "docs.google.com" ? ["142.250.183.110"] : ["10.0.0.7"]);
    const { fn, calls } = fakeFetch({ [SHEET]: redirect(EXPORT_HOST) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: fn, lookup }))).toMatch(/unexpected/);
    expect(calls).toEqual([SHEET]);
  });

  it("detects a redirect loop", async () => {
    const other = "https://docs.google.com/spreadsheets/d/abcdefghij1234567890/export?format=csv&x=1";
    const { fn, calls } = fakeFetch({ [SHEET]: redirect(other), [other]: redirect(SHEET) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns }))).toMatch(/loop/);
    expect(calls).toEqual([SHEET, other]);
  });

  it("stops after the hop limit", async () => {
    const hop = (n: number) => `https://docs.google.com/spreadsheets/d/abcdefghij1234567890/export?format=csv&hop=${n}`;
    const routes: Record<string, Route> = { [SHEET]: redirect(hop(1)) };
    for (let n = 1; n < 10; n++) routes[hop(n)] = redirect(hop(n + 1));
    const { fn, calls } = fakeFetch(routes);
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns, maxRedirects: 3 }))).toMatch(/too many times/);
    expect(calls).toHaveLength(4); // the start URL + 3 followed redirects; the 4th Location is never connected to
  });

  it("caps the body while streaming when Content-Length is missing", async () => {
    const big = new Uint8Array(64 * 1024).fill(0x61);
    const { fn } = fakeFetch({ [SHEET]: () => new Response(stream(Array.from({ length: 20 }, () => big)), { status: 200, headers: { "content-type": "text/csv" } }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns, maxBytes: 512 * 1024 }))).toMatch(/larger than 5 MB/);
  });

  it("caps the body when Content-Length lies (declares less than is sent)", async () => {
    const big = new Uint8Array(300 * 1024).fill(0x61);
    const { fn } = fakeFetch({ [SHEET]: () => new Response(stream([big, big]), { status: 200, headers: { "content-type": "text/csv", "content-length": "10" } }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns, maxBytes: 512 * 1024 }))).toMatch(/larger than 5 MB/);
  });

  it("refuses a single oversize chunk, and a declared oversize length before reading", async () => {
    const one = fakeFetch({ [SHEET]: () => new Response(stream([new Uint8Array(600 * 1024)]), { status: 200, headers: { "content-type": "text/csv" } }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: one.fn, lookup: publicDns, maxBytes: 512 * 1024 }))).toMatch(/larger than 5 MB/);
    const declared = fakeFetch({ [SHEET]: () => new Response(stream([], { hang: true }), { status: 200, headers: { "content-type": "text/csv", "content-length": String(6 * 1024 * 1024) } }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: declared.fn, lookup: publicDns, timeoutMs: 5_000 }))).toMatch(/larger than 5 MB/);
  });

  it("one deadline covers every hop and the body", async () => {
    // Hangs until aborted, like a real fetch honouring the signal.
    const slow: Route = (_u, init) => new Promise<Response>((_r, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const a = fakeFetch({ [SHEET]: redirect(EXPORT_HOST), [EXPORT_HOST]: slow });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: a.fn, lookup: publicDns, timeoutMs: 100 }))).toMatch(/too long/);
    // A body that never ends (and a stream that ignores the signal) is cut off by the same deadline.
    const b = fakeFetch({ [SHEET]: () => new Response(stream([new TextEncoder().encode("slug\n")], { hang: true }), { status: 200, headers: { "content-type": "text/csv" } }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: b.fn, lookup: publicDns, timeoutMs: 100 }))).toMatch(/too long/);
    // A resolver that never answers is bounded too.
    const c = fakeFetch({});
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: c.fn, lookup: () => new Promise<string[]>(() => {}), timeoutMs: 100 }))).toMatch(/too long/);
    expect(c.calls).toEqual([]);
  });

  it("refuses web pages, non-text types, malformed bodies and broken streams", async () => {
    const html = fakeFetch({ [SHEET]: csv("<!DOCTYPE html><html><body>Sign in</body></html>", { "content-type": "text/html; charset=utf-8" }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: html.fn, lookup: publicDns }))).toMatch(/web page/);
    const sniffed = fakeFetch({ [SHEET]: csv("<html><body>x</body></html>", { "content-type": "text/plain" }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: sniffed.fn, lookup: publicDns }))).toMatch(/web page/);
    const binary = fakeFetch({ [SHEET]: csv("PK\u0003\u0004", { "content-type": "application/zip" }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: binary.fn, lookup: publicDns }))).toMatch(/not a CSV or text export/);
    const badUtf8 = fakeFetch({ [SHEET]: csv(new Uint8Array([0x73, 0x6c, 0xff, 0xfe, 0x0a])) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: badUtf8.fn, lookup: publicDns }))).toMatch(/UTF-8/);
    const broken = fakeFetch({ [SHEET]: () => new Response(stream([new TextEncoder().encode("slug\n")], { error: true }), { status: 200, headers: { "content-type": "text/csv" } }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: broken.fn, lookup: publicDns }))).toMatch(/Could not read/);
    const noLocation = fakeFetch({ [SHEET]: () => new Response(null, { status: 302 }) });
    expect(await refusal(fetchGoogleExport(SHEET, { fetch: noLocation.fn, lookup: publicDns }))).toMatch(/unexpected/);
  });

  it("keeps the operator messages for Google's error statuses", async () => {
    for (const [status, re] of [[403, /refused access/], [404, /404/], [400, /tab \(gid\)/], [500, /Google returned 500/]] as const) {
      const { fn } = fakeFetch({ [SHEET]: () => new Response("no", { status }) });
      expect(await refusal(fetchGoogleExport(SHEET, { fetch: fn, lookup: publicDns }))).toMatch(re);
    }
  });

  it("validates the start URL like any other hop", async () => {
    const { fn, calls } = fakeFetch({});
    expect(await refusal(fetchGoogleExport("https://evil.example.com/x", { fetch: fn, lookup: publicDns }))).toMatch(/unexpected/);
    expect(calls).toEqual([]);
  });
});

describe("export host allowlist and address classification", () => {
  it("allows only docs.google.com and the doc-…-(sheets|docs) export hosts", () => {
    for (const h of ["docs.google.com", "doc-0s-4g-sheets.googleusercontent.com", "doc-14-5c-docs.googleusercontent.com"]) expect(isAllowedExportHost(h), h).toBe(true);
    for (const h of ["google.com", "drive.google.com", "accounts.google.com", "googleusercontent.com", "lh3.googleusercontent.com", "sites.googleusercontent.com", "x-doc-0s-4g-sheets.googleusercontent.com", "doc-0s-4g-sheets.googleusercontent.com.evil.example", "docs.google.com."]) {
      expect(isAllowedExportHost(h), h).toBe(false);
    }
  });

  it("classifies private, loopback, link-local and mapped addresses", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "not-an-ip"]) expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["142.250.183.110", "8.8.8.8", "2607:f8b0:4004:c07::8a", "::ffff:8.8.8.8"]) expect(isPrivateAddress(a), a).toBe(false);
  });
});

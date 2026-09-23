import { describe, expect, it } from "vitest";
import { isRecipientAllowed } from "../allowlist";

describe("non-production recipient allowlist (§14.1 non-negotiable #3)", () => {
  it("an empty allowlist suppresses everything", () => {
    expect(isRecipientAllowed("ops@outlyy.com", [])).toBe(false);
    expect(isRecipientAllowed("+919876543210", [])).toBe(false);
  });

  it("matches full addresses and numbers exactly, case-insensitively", () => {
    const list = ["Ops@Outlyy.com", "+919876543210"];
    expect(isRecipientAllowed("ops@outlyy.com", list)).toBe(true);
    expect(isRecipientAllowed("OPS@OUTLYY.COM", list)).toBe(true);
    expect(isRecipientAllowed("+919876543210", list)).toBe(true);
    expect(isRecipientAllowed("ops@outlyy.co", list)).toBe(false);
    expect(isRecipientAllowed("+919876543211", list)).toBe(false);
  });

  it("matches an email domain entry", () => {
    expect(isRecipientAllowed("anyone@outlyy.com", ["@outlyy.com"])).toBe(true);
    expect(isRecipientAllowed("anyone@notoutlyy.com", ["@outlyy.com"])).toBe(false);
    expect(isRecipientAllowed("anyone@outlyy.com.evil.com", ["@outlyy.com"])).toBe(false);
  });

  it("matches a phone prefix entry, but never applies a prefix to an email", () => {
    expect(isRecipientAllowed("+9198765", ["+9198765"])).toBe(true);
    expect(isRecipientAllowed("+919876543210", ["+9198765"])).toBe(true);
    expect(isRecipientAllowed("+919976543210", ["+9198765"])).toBe(false);
    expect(isRecipientAllowed("+9198765@example.com", ["+9198765"])).toBe(false);
  });

  it("ignores blank entries and surrounding whitespace", () => {
    expect(isRecipientAllowed("ops@outlyy.com", ["", "  ", " ops@outlyy.com "])).toBe(true);
    expect(isRecipientAllowed("  ops@outlyy.com ", ["ops@outlyy.com"])).toBe(true);
    expect(isRecipientAllowed("anything", ["", " "])).toBe(false);
  });

  it("a bare domain without @ is not a wildcard", () => {
    expect(isRecipientAllowed("someone@outlyy.com", ["outlyy.com"])).toBe(false);
  });
});

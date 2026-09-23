import { describe, expect, it } from "vitest";
import {
  canTransition,
  CONTACTED_OR_LATER,
  customerStage,
  LOST_REASON_LABELS,
  LOST_REASONS,
  OPEN_STATUSES,
  STATUS_LABELS,
  TERMINAL,
  TRANSITIONS,
} from "../inquiry-state";
import type { InquiryStatus } from "@/lib/types";

const ALL: InquiryStatus[] = ["new", "assigned", "contacted", "quoted", "negotiating", "payment_pending", "won", "lost", "spam"];

describe("inquiry-state: pipeline (§17 §7.1)", () => {
  it("follows the happy path end to end", () => {
    const path: InquiryStatus[] = ["new", "assigned", "contacted", "quoted", "negotiating", "payment_pending", "won"];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("never leaves won", () => {
    for (const to of ALL) expect(canTransition("won", to)).toBe(false);
    expect(TRANSITIONS.won).toEqual([]);
  });

  it("can be lost from every open status", () => {
    for (const from of OPEN_STATUSES) expect(canTransition(from, "lost"), `${from} -> lost`).toBe(true);
  });

  it("can only be marked spam via a status change before a quote goes out", () => {
    // Later stages are a real conversation; the dedicated markSpam path (refuses only `won`) covers them.
    for (const from of ["new", "assigned", "contacted"] as const) expect(canTransition(from, "spam"), `${from} -> spam`).toBe(true);
    for (const from of ["quoted", "negotiating", "payment_pending"] as const) expect(canTransition(from, "spam"), `${from} -> spam`).toBe(false);
  });

  it("cannot skip straight from new/assigned to quoted or won", () => {
    expect(canTransition("new", "quoted")).toBe(false);
    expect(canTransition("new", "won")).toBe(false);
    expect(canTransition("assigned", "won")).toBe(false);
    expect(canTransition("assigned", "payment_pending")).toBe(false);
  });

  it("cannot win before a quote exists", () => {
    expect(canTransition("contacted", "won")).toBe(false);
    expect(canTransition("quoted", "won")).toBe(true);
  });

  it("allows a lost inquiry to be reopened and spam to be restored", () => {
    expect(canTransition("lost", "contacted")).toBe(true);
    expect(canTransition("lost", "assigned")).toBe(true);
    expect(canTransition("lost", "won")).toBe(false);
    expect(canTransition("spam", "new")).toBe(true);
    expect(canTransition("spam", "contacted")).toBe(false);
  });

  it("supports payment link expiry going back to negotiation", () => {
    expect(canTransition("payment_pending", "negotiating")).toBe(true);
    expect(canTransition("payment_pending", "lost")).toBe(true);
  });

  it("returns false for unknown statuses instead of throwing", () => {
    expect(canTransition("nope" as InquiryStatus, "new")).toBe(false);
  });

  it("classifies terminal and open statuses without overlap", () => {
    expect([...TERMINAL].sort()).toEqual(["lost", "spam", "won"]);
    for (const s of OPEN_STATUSES) expect(TERMINAL.has(s)).toBe(false);
    expect(new Set([...OPEN_STATUSES, ...TERMINAL]).size).toBe(ALL.length);
  });

  it("marks first response on contacted and everything after it", () => {
    expect(CONTACTED_OR_LATER.has("new")).toBe(false);
    expect(CONTACTED_OR_LATER.has("assigned")).toBe(false);
    expect(CONTACTED_OR_LATER.has("contacted")).toBe(true);
    expect(CONTACTED_OR_LATER.has("quoted")).toBe(true);
    expect(CONTACTED_OR_LATER.has("won")).toBe(true);
    expect(CONTACTED_OR_LATER.has("lost")).toBe(false);
  });
});

describe("inquiry-state: labels and customer stage", () => {
  it("has a label for every status and every loss reason", () => {
    for (const s of ALL) expect(STATUS_LABELS[s]).toBeTruthy();
    for (const r of LOST_REASONS) expect(LOST_REASON_LABELS[r]).toBeTruthy();
    expect(LOST_REASONS).toContain("no_response");
    expect(LOST_REASONS).toContain("payment_expired");
  });

  it("maps statuses onto the 4-stage customer track", () => {
    expect(customerStage("new")).toBe(0);
    expect(customerStage("assigned")).toBe(0);
    expect(customerStage("contacted")).toBe(1);
    expect(customerStage("quoted")).toBe(2);
    expect(customerStage("negotiating")).toBe(2);
    expect(customerStage("payment_pending")).toBe(3);
    expect(customerStage("won")).toBe(3);
    expect(customerStage("lost")).toBe(3);
  });
});

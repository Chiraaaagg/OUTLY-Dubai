import { describe, expect, it } from "vitest";
import { computeSlaDueAt, DEFAULT_SLA, formatDeadline, isBusinessDay, isWithinBusinessHours, type SlaConfig } from "../sla";

/**
 * The default config is the real one: 10:00–18:00 Gulf Standard Time,
 * Monday to Saturday. GST is UTC+4 with no daylight saving, so
 * `gst(h, m)` is simply UTC minus four hours.
 *
 * Reference dates: 14 Sep 2026 is a Monday, 19 Sep is a Saturday,
 * 20 Sep is a Sunday.
 */
const gst = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 8, day, h - 4, m));
const MON = 14;
const SAT = 19;
const SUN = 20;

describe("sla", () => {
  it("adds the SLA inside business hours", () => {
    const now = gst(MON, 14, 0);
    const due = computeSlaDueAt(DEFAULT_SLA, now);
    expect(due.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(isWithinBusinessHours(DEFAULT_SLA, now)).toBe(true);
  });

  it("caps at closing time when the window crosses it", () => {
    const now = gst(MON, 17, 45);
    const due = computeSlaDueAt(DEFAULT_SLA, now);
    expect(formatDeadline(due, DEFAULT_SLA, now)).toBe("6:00 pm GST");
  });

  it("pushes to next opening + SLA out of hours", () => {
    const now = gst(MON, 21, 30);
    expect(isWithinBusinessHours(DEFAULT_SLA, now)).toBe(false);
    const due = computeSlaDueAt(DEFAULT_SLA, now);
    expect(formatDeadline(due, DEFAULT_SLA, now)).toBe("10:30 am GST tomorrow");
  });

  it("early morning submissions land after opening the same day", () => {
    const now = gst(MON, 6, 10);
    const due = computeSlaDueAt(DEFAULT_SLA, now);
    expect(formatDeadline(due, DEFAULT_SLA, now)).toBe("10:30 am GST");
  });

  /* ------------------------------------------------------------ business days */

  it("Sunday is not a business day, whatever the hour", () => {
    const noon = gst(SUN, 12, 0);
    expect(isBusinessDay(DEFAULT_SLA, noon)).toBe(false);
    expect(isWithinBusinessHours(DEFAULT_SLA, noon)).toBe(false);
  });

  it("a Sunday submission is promised Monday morning, not 30 minutes", () => {
    const now = gst(SUN, 12, 0);
    const due = computeSlaDueAt(DEFAULT_SLA, now);
    expect(due.getTime() - now.getTime()).toBeGreaterThan(20 * 3600_000);
    expect(formatDeadline(due, DEFAULT_SLA, now)).toBe("10:30 am GST tomorrow");
  });

  it("Saturday evening skips Sunday entirely", () => {
    const now = gst(SAT, 19, 0);
    const due = computeSlaDueAt(DEFAULT_SLA, now);
    // Sunday is closed, so the promise is Monday.
    expect(formatDeadline(due, DEFAULT_SLA, now)).toBe("10:30 am GST on Mon, 21 Sept");
  });

  it("a Monday-to-Friday config pushes a Friday night lead to Monday", () => {
    const weekdaysOnly: SlaConfig = { ...DEFAULT_SLA, businessDays: [1, 2, 3, 4, 5] };
    const fridayNight = gst(18, 22, 0); // Fri 18 Sep 2026
    const due = computeSlaDueAt(weekdaysOnly, fridayNight);
    expect(formatDeadline(due, weekdaysOnly, fridayNight)).toBe("10:30 am GST on Mon, 21 Sept");
  });

  it("an empty business-day list is treated as every day rather than hanging", () => {
    const broken: SlaConfig = { ...DEFAULT_SLA, businessDays: [] };
    const now = gst(SUN, 12, 0);
    const due = computeSlaDueAt(broken, now);
    expect(due.getTime() - now.getTime()).toBe(30 * 60_000);
  });

  it("still works for an India-based configuration", () => {
    const india: SlaConfig = { ...DEFAULT_SLA, timeZone: "Asia/Kolkata", businessStart: "09:00", businessEnd: "23:00", businessDays: [0, 1, 2, 3, 4, 5, 6] };
    // 23:30 IST = 18:00 UTC on the same day.
    const lateNight = new Date(Date.UTC(2026, 8, MON, 18, 0));
    expect(isWithinBusinessHours(india, lateNight)).toBe(false);
    expect(formatDeadline(computeSlaDueAt(india, lateNight), india, lateNight)).toBe("9:30 am IST tomorrow");
  });
});

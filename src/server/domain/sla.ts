/**
 * SLA arithmetic — pure, time injected (§04.3.3).
 *
 * The promise is a concrete timestamp, never a duration (§17 §3.9 rule 1), and
 * it visibly adapts out of hours (rule 2). Config comes from `settings.sla.*`
 * (admin-editable, §17 §6.4) with env defaults; nothing here reads the clock.
 *
 * Business *days* matter as much as business hours: the team works Monday to
 * Saturday, so a Sunday submission must be promised a Monday reply rather than
 * a 30-minute one nobody is there to keep.
 */

export interface SlaConfig {
  responseMinutes: number;
  /** "HH:MM" local to `timeZone` */
  businessStart: string;
  businessEnd: string;
  /** Days the team works, 0 = Sunday … 6 = Saturday. */
  businessDays: number[];
  timeZone: string;
  escalationMinutes: number;
}

export const DEFAULT_SLA: SlaConfig = {
  responseMinutes: 30,
  businessStart: "10:00",
  businessEnd: "18:00",
  businessDays: [1, 2, 3, 4, 5, 6],
  timeZone: "Asia/Dubai",
  escalationMinutes: 30,
};

/** Highest day count we will step forward before giving up — a config with no open day must not loop. */
const MAX_LOOKAHEAD_DAYS = 8;
const DAY_MS = 24 * 3600_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Days the config actually opens; an empty or malformed list falls back to every day so nothing deadlocks. */
function openDays(cfg: SlaConfig): number[] {
  const days = (cfg.businessDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length ? days : [0, 1, 2, 3, 4, 5, 6];
}

export function zonedParts(d: Date, timeZone: string): { minutesOfDay: number; dayKey: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const weekday = WEEKDAYS.indexOf(get("weekday").slice(0, 3) as (typeof WEEKDAYS)[number]);
  return { minutesOfDay: hour * 60 + minute, dayKey: `${get("year")}-${get("month")}-${get("day")}`, weekday: weekday < 0 ? 0 : weekday };
}

export function isBusinessDay(cfg: SlaConfig, now: Date): boolean {
  return openDays(cfg).includes(zonedParts(now, cfg.timeZone).weekday);
}

export function isWithinBusinessHours(cfg: SlaConfig, now: Date): boolean {
  const { minutesOfDay, weekday } = zonedParts(now, cfg.timeZone);
  if (!openDays(cfg).includes(weekday)) return false;
  return minutesOfDay >= parseHHMM(cfg.businessStart) && minutesOfDay < parseHHMM(cfg.businessEnd);
}

/**
 * Deadline = submission + SLA inside business hours (capped at closing);
 * otherwise the next opening + SLA, skipping days the team does not work.
 * Mirrors src/lib/inquiry.ts so the client preview and the server value agree.
 */
export function computeSlaDueAt(cfg: SlaConfig, now: Date): Date {
  const open = parseHHMM(cfg.businessStart);
  const close = parseHHMM(cfg.businessEnd);
  const here = zonedParts(now, cfg.timeZone);
  const days = openDays(cfg);

  if (days.includes(here.weekday) && here.minutesOfDay >= open && here.minutesOfDay < close) {
    const due = new Date(now.getTime() + cfg.responseMinutes * 60_000);
    const after = zonedParts(due, cfg.timeZone);
    if (after.minutesOfDay >= close || after.dayKey !== here.dayKey) {
      // Reply lands at closing time — not at 6:12pm to someone who was told 6pm.
      const overshoot = after.dayKey !== here.dayKey ? after.minutesOfDay + (24 * 60 - close) : after.minutesOfDay - close;
      due.setTime(due.getTime() - overshoot * 60_000);
    }
    return due;
  }

  // Out of hours: walk forward to the next minute the office is open, then add the SLA.
  // Today still counts when we are simply early; otherwise start from tomorrow.
  const startsToday = days.includes(here.weekday) && here.minutesOfDay < open;
  let minutesAhead = startsToday ? open - here.minutesOfDay : 24 * 60 - here.minutesOfDay + open;

  for (let step = startsToday ? 0 : 1; step < MAX_LOOKAHEAD_DAYS; step++) {
    const candidate = new Date(now.getTime() + minutesAhead * 60_000);
    if (days.includes(zonedParts(candidate, cfg.timeZone).weekday)) {
      return new Date(candidate.getTime() + cfg.responseMinutes * 60_000);
    }
    minutesAhead += 24 * 60;
  }
  // Unreachable with a sane config (openDays never returns empty); fail open rather than hang.
  return new Date(now.getTime() + cfg.responseMinutes * 60_000);
}

/** "IST" / "GST" / the raw IANA name for anything else. */
export function timeZoneLabel(timeZone: string): string {
  if (timeZone === "Asia/Kolkata") return "IST";
  if (timeZone === "Asia/Dubai") return "GST";
  return timeZone;
}

/** "5:09 pm GST" · "10:30 am GST tomorrow" · "10:30 am GST on Mon 16 Sep" */
export function formatDeadline(due: Date, cfg: SlaConfig, now: Date): string {
  const tzLabel = timeZoneLabel(cfg.timeZone);
  const time = due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: cfg.timeZone });
  const dayNow = zonedParts(now, cfg.timeZone).dayKey;
  const dayDue = zonedParts(due, cfg.timeZone).dayKey;
  if (dayDue === dayNow) return `${time} ${tzLabel}`;
  const tomorrow = zonedParts(new Date(now.getTime() + DAY_MS), cfg.timeZone).dayKey;
  if (dayDue === tomorrow) return `${time} ${tzLabel} tomorrow`;
  const date = due.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: cfg.timeZone });
  return `${time} ${tzLabel} on ${date}`;
}

/** Follow-up ladder step → hours after last contact (§17 §7.2). */
export function nextFollowupAt(ladderHours: number[], stage: number, from: Date): Date | null {
  const hours = ladderHours[stage];
  if (hours === undefined) return null;
  return new Date(from.getTime() + hours * 3600 * 1000);
}

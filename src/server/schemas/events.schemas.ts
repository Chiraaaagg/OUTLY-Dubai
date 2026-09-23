import { z } from "zod";
import { ANALYTICS_EVENT_NAMES, type AnalyticsEvent } from "@/lib/analytics";

/**
 * POST /api/events body validation (§11.3 step 1, §19 §3).
 *
 * The body is one event object or an array of them (sendBeacon batches).
 * Each event is `{ event, event_id, ts?, ...props }` where every prop is a
 * primitive — no nesting, no arrays — so the collector can never be used as
 * free JSON storage. Unknown event names are rejected loudly in development
 * (422) and dropped silently in production (`parseEventsBody` reports them
 * as `rejected`; the route answers 204 either way).
 *
 * No `server-only` import: this file is unit-tested in a plain Node runner.
 */

export const MAX_EVENTS_PER_REQUEST = 50;
export const MAX_PROP_KEYS = 40;
export const MAX_STRING_LENGTH = 500;
export const MAX_EVENT_ID_LENGTH = 80;

const RESERVED_KEYS = new Set(["event", "event_id", "ts"]);
const PROP_KEY = /^[a-z][a-z0-9_]{0,63}$/;

const primitive = z.union([z.string().max(MAX_STRING_LENGTH), z.number(), z.boolean(), z.null()]);

export const eventNameSchema = z.enum(ANALYTICS_EVENT_NAMES);

/**
 * One client event. `event` must be a known name; every other key is a
 * primitive prop. Key names are snake_case identifiers and at most
 * `MAX_PROP_KEYS` of them are allowed.
 */
function withPropRules<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return schema
    .catchall(primitive)
    .refine((o) => Object.keys(o).filter((k) => !RESERVED_KEYS.has(k)).length <= MAX_PROP_KEYS, {
      message: `At most ${MAX_PROP_KEYS} properties per event`,
    })
    .refine((o) => Object.keys(o).every((k) => RESERVED_KEYS.has(k) || PROP_KEY.test(k)), {
      message: "Property names must be snake_case identifiers",
    });
}

const eventIdSchema = z.string().min(1).max(MAX_EVENT_ID_LENGTH);
const tsSchema = z.number().int().nonnegative().optional();

export const clientEventSchema = withPropRules(
  z.object({
    event: eventNameSchema,
    event_id: eventIdSchema,
    ts: tsSchema,
  }),
);

/**
 * Declared rather than inferred: zod's `catchall` output type collapses the
 * known keys to `unknown` under an index signature, which is not useful.
 */
export type ClientEventBody = { event: AnalyticsEvent; event_id: string; ts?: number } & Record<string, string | number | boolean | null | undefined>;

/** Strict form used in development: the whole body must validate. */
export const eventsBodySchema = z.union([clientEventSchema, z.array(clientEventSchema).min(1).max(MAX_EVENTS_PER_REQUEST)]);

/** Shape-only check used to tell "unknown event name" apart from "garbage". */
const looseEventSchema = withPropRules(
  z.object({
    event: z.string().min(1).max(80),
    event_id: eventIdSchema,
    ts: tsSchema,
  }),
);

export interface ParsedEventsBody {
  /** Events that passed validation, in order. */
  events: ClientEventBody[];
  /** Count of items dropped: unknown names, malformed items, overflow beyond the batch cap. */
  rejected: number;
  /** Human-readable reasons, `index: message`. Only surfaced to the client in development. */
  issues: string[];
  /** Names that were not in the taxonomy — logged so a typo in `track()` is visible. */
  unknownNames: string[];
}

/**
 * Lenient, item-by-item parse: one bad event never sinks the batch. The route
 * decides whether `issues` become a 422 (development) or a 204 (production).
 */
export function parseEventsBody(raw: unknown): ParsedEventsBody {
  const out: ParsedEventsBody = { events: [], rejected: 0, issues: [], unknownNames: [] };
  if (raw === undefined || raw === null) {
    out.issues.push("_: empty body");
    return out;
  }
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  if (items.length === 0) {
    out.issues.push("_: empty batch");
    return out;
  }
  if (items.length > MAX_EVENTS_PER_REQUEST) {
    out.rejected += items.length - MAX_EVENTS_PER_REQUEST;
    out.issues.push(`_: batch larger than ${MAX_EVENTS_PER_REQUEST}`);
    items.length = MAX_EVENTS_PER_REQUEST;
  }
  items.forEach((item, i) => {
    const strict = clientEventSchema.safeParse(item);
    if (strict.success) {
      out.events.push(strict.data as ClientEventBody);
      return;
    }
    out.rejected++;
    const loose = looseEventSchema.safeParse(item);
    if (loose.success) {
      // Shape is fine; only the name is unknown.
      out.unknownNames.push(String((loose.data as { event: unknown }).event));
      out.issues.push(`${i}.event: unknown event name`);
      return;
    }
    const first = strict.error.issues[0];
    const path = first?.path.length ? first.path.join(".") : "_";
    out.issues.push(`${i}.${path}: ${first?.message ?? "invalid"}`);
  });
  return out;
}

export function isAnalyticsEventName(name: string): name is AnalyticsEvent {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(name);
}

import { describe, expect, it } from "vitest";
import {
  clientEventSchema,
  eventsBodySchema,
  MAX_EVENTS_PER_REQUEST,
  MAX_PROP_KEYS,
  parseEventsBody,
} from "../events.schemas";

const ok = { event: "activity_viewed", event_id: "activity_viewed-abc-123", ts: 1_800_000_000_000, activity_slug: "desert-safari", tier: "B", price: 4200, has_dietary_filter: false, session_id: "s_12345678", anon_id: "a_12345678" };

describe("clientEventSchema", () => {
  it("accepts a well-formed event with primitive props", () => {
    const r = clientEventSchema.safeParse(ok);
    expect(r.success).toBe(true);
  });

  it("rejects unknown event names", () => {
    expect(clientEventSchema.safeParse({ ...ok, event: "made_up" }).success).toBe(false);
  });

  it("rejects missing or oversized event_id", () => {
    expect(clientEventSchema.safeParse({ ...ok, event_id: "" }).success).toBe(false);
    expect(clientEventSchema.safeParse({ ...ok, event_id: "x".repeat(81) }).success).toBe(false);
  });

  it("rejects nested values and arrays", () => {
    expect(clientEventSchema.safeParse({ ...ok, nested: { a: 1 } }).success).toBe(false);
    expect(clientEventSchema.safeParse({ ...ok, list: [1, 2] }).success).toBe(false);
  });

  it("rejects strings over 500 chars", () => {
    expect(clientEventSchema.safeParse({ ...ok, filters: "f".repeat(501) }).success).toBe(false);
    expect(clientEventSchema.safeParse({ ...ok, filters: "f".repeat(500) }).success).toBe(true);
  });

  it("rejects more than the prop-key cap", () => {
    const many: Record<string, unknown> = { event: "page_view", event_id: "pv-1" };
    for (let i = 0; i < MAX_PROP_KEYS + 1; i++) many[`k${i}`] = i;
    expect(clientEventSchema.safeParse(many).success).toBe(false);
    delete many[`k${MAX_PROP_KEYS}`];
    expect(clientEventSchema.safeParse(many).success).toBe(true);
  });

  it("rejects non snake_case keys and non-integer ts", () => {
    expect(clientEventSchema.safeParse({ ...ok, "Bad Key": 1 }).success).toBe(false);
    expect(clientEventSchema.safeParse({ ...ok, "__proto__x": 1 }).success).toBe(false);
    expect(clientEventSchema.safeParse({ ...ok, ts: 1.5 }).success).toBe(false);
    expect(clientEventSchema.safeParse({ ...ok, ts: -1 }).success).toBe(false);
  });
});

describe("eventsBodySchema", () => {
  it("accepts a single object or a non-empty array up to the batch cap", () => {
    expect(eventsBodySchema.safeParse(ok).success).toBe(true);
    expect(eventsBodySchema.safeParse([ok, { ...ok, event_id: "b" }]).success).toBe(true);
    expect(eventsBodySchema.safeParse([]).success).toBe(false);
    expect(eventsBodySchema.safeParse(Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, (_, i) => ({ ...ok, event_id: `e${i}` }))).success).toBe(false);
  });
});

describe("parseEventsBody", () => {
  it("returns every valid event and no issues for a clean batch", () => {
    const r = parseEventsBody([ok, { ...ok, event: "inquiry_started", event_id: "is-1" }]);
    expect(r.events.map((e) => e.event)).toEqual(["activity_viewed", "inquiry_started"]);
    expect(r.rejected).toBe(0);
    expect(r.issues).toEqual([]);
    expect(r.unknownNames).toEqual([]);
  });

  it("wraps a single object into a batch of one", () => {
    expect(parseEventsBody(ok).events).toHaveLength(1);
  });

  it("drops unknown names but keeps the rest, reporting the unknown name", () => {
    const r = parseEventsBody([{ ...ok, event: "typo_event" }, ok]);
    expect(r.events).toHaveLength(1);
    expect(r.rejected).toBe(1);
    expect(r.unknownNames).toEqual(["typo_event"]);
    expect(r.issues[0]).toMatch(/^0\.event: unknown event name$/);
  });

  it("reports malformed items by index and path", () => {
    const r = parseEventsBody([ok, { event: "page_view" }, { event: "page_view", event_id: "x", nested: {} }]);
    expect(r.events).toHaveLength(1);
    expect(r.rejected).toBe(2);
    expect(r.issues).toHaveLength(2);
    expect(r.issues[0]).toMatch(/^1\.event_id: /);
    expect(r.issues[1]).toMatch(/^2\./);
    expect(r.unknownNames).toEqual([]);
  });

  it("caps oversized batches and counts the overflow as rejected", () => {
    const big = Array.from({ length: MAX_EVENTS_PER_REQUEST + 5 }, (_, i) => ({ ...ok, event_id: `e${i}` }));
    const r = parseEventsBody(big);
    expect(r.events).toHaveLength(MAX_EVENTS_PER_REQUEST);
    expect(r.rejected).toBe(5);
    expect(r.issues[0]).toMatch(/batch larger than/);
  });

  it("flags empty bodies", () => {
    expect(parseEventsBody(undefined).issues).toEqual(["_: empty body"]);
    expect(parseEventsBody(null).issues).toEqual(["_: empty body"]);
    expect(parseEventsBody([]).issues).toEqual(["_: empty batch"]);
    expect(parseEventsBody("string").events).toHaveLength(0);
  });
});

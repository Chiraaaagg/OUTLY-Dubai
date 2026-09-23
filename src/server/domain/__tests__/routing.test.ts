import { describe, expect, it } from "vitest";
import { chooseAgent, type AgentCandidate, type RoutingContext } from "../routing";

function agent(overrides: Partial<AgentCandidate> & { id: string }): AgentCandidate {
  return {
    status: "available",
    maxConcurrent: 10,
    openCount: 0,
    skills: [],
    shift: "IST",
    roles: ["agent"],
    ...overrides,
  };
}

function ctx(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    totalInrMinor: 20_000_00n,
    guests: 2,
    currency: "INR",
    countryCode: "+91",
    hasTierD: false,
    withinBusinessHours: true,
    activeShift: "IST",
    premiumThresholdMinor: 100_000_00n,
    groupThreshold: 5,
    maxConcurrentDefault: 15,
    ...overrides,
  };
}

describe("routing: capacity", () => {
  it("queues (null) when nobody has capacity", () => {
    const pool = [agent({ id: "a", status: "away" }), agent({ id: "b", maxConcurrent: 2, openCount: 2 }), agent({ id: "c", status: "offline" })];
    expect(chooseAgent(pool, ctx())).toEqual({ agent: null, rule: "no_capacity" });
  });

  it("falls back to the default cap when maxConcurrent is 0", () => {
    const pool = [agent({ id: "a", maxConcurrent: 0, openCount: 15 }), agent({ id: "b", maxConcurrent: 0, openCount: 3 })];
    expect(chooseAgent(pool, ctx({ maxConcurrentDefault: 15 })).agent?.id).toBe("b");
  });

  it("returns null for an empty pool", () => {
    expect(chooseAgent([], ctx()).agent).toBeNull();
  });
});

describe("routing: rule order (§17 §7.3)", () => {
  it("1. returning customer goes back to the previous agent when available", () => {
    const pool = [agent({ id: "busy-lead", roles: ["agent_lead"], openCount: 0 }), agent({ id: "prev", openCount: 9 })];
    const r = chooseAgent(pool, ctx({ previousAgentId: "prev", hasTierD: true }));
    expect(r).toEqual({ agent: pool[1], rule: "returning_customer" });
  });

  it("1. ...but not when the previous agent is at capacity", () => {
    const pool = [agent({ id: "prev", maxConcurrent: 1, openCount: 1 }), agent({ id: "other" })];
    expect(chooseAgent(pool, ctx({ previousAgentId: "prev" })).agent?.id).toBe("other");
  });

  it("2. premium value routes to a lead or premium-skilled agent", () => {
    const pool = [agent({ id: "junior", openCount: 0 }), agent({ id: "lead", roles: ["agent_lead"], openCount: 4 }), agent({ id: "lux", skills: ["luxury"], openCount: 2 })];
    const r = chooseAgent(pool, ctx({ totalInrMinor: 150_000_00n }));
    expect(r.rule).toBe("premium");
    expect(r.agent?.id).toBe("lux"); // least loaded among seniors
  });

  it("2. Tier D routes premium regardless of value", () => {
    const pool = [agent({ id: "junior" }), agent({ id: "lead", roles: ["agent_lead"], openCount: 5 })];
    expect(chooseAgent(pool, ctx({ hasTierD: true, totalInrMinor: 5_000_00n })).agent?.id).toBe("lead");
  });

  it("2. premium falls through when no senior has capacity", () => {
    const pool = [agent({ id: "junior" }), agent({ id: "lead", roles: ["agent_lead"], status: "busy" })];
    const r = chooseAgent(pool, ctx({ hasTierD: true }));
    expect(r.agent?.id).toBe("junior");
    expect(r.rule).not.toBe("premium");
  });

  it("3. UAE residents (AED or +971) go to the GST shift", () => {
    const pool = [agent({ id: "ist", shift: "IST" }), agent({ id: "gst", shift: "GST", openCount: 3 })];
    expect(chooseAgent(pool, ctx({ currency: "AED" }))).toEqual({ agent: pool[1], rule: "uae_shift" });
    expect(chooseAgent(pool, ctx({ countryCode: "+971" })).rule).toBe("uae_shift");
    const uaeSkill = [agent({ id: "ist", shift: "IST" }), agent({ id: "flex", shift: "IST", skills: ["uae-shift"] })];
    expect(chooseAgent(uaeSkill, ctx({ currency: "AED" })).agent?.id).toBe("flex");
  });

  it("4. groups and Jain requests match skills", () => {
    const pool = [agent({ id: "plain" }), agent({ id: "groups", skills: ["groups"], openCount: 4 }), agent({ id: "jain", skills: ["jain"], openCount: 4 })];
    expect(chooseAgent(pool, ctx({ guests: 6 }))).toMatchObject({ agent: { id: "groups" }, rule: "skill:groups" });
    expect(chooseAgent(pool, ctx({ dietary: "jain" }))).toMatchObject({ agent: { id: "jain" }, rule: "skill:jain" });
    const both = chooseAgent(pool, ctx({ guests: 6, dietary: "jain" }));
    expect(both.rule).toBe("skill:groups+jain");
    expect(["groups", "jain"]).toContain(both.agent?.id);
  });

  it("5. round-robin picks the least loaded agent on the active shift", () => {
    const pool = [agent({ id: "ist-busy", shift: "IST", openCount: 5 }), agent({ id: "ist-free", shift: "IST", openCount: 1 }), agent({ id: "gst-idle", shift: "GST", openCount: 0 })];
    expect(chooseAgent(pool, ctx({ activeShift: "IST" }))).toEqual({ agent: pool[1], rule: "round_robin_on_shift" });
    expect(chooseAgent(pool, ctx({ activeShift: "GST" }))).toEqual({ agent: pool[2], rule: "round_robin_on_shift" });
  });

  it("6. falls back to any available agent when nobody is on the active shift", () => {
    const pool = [agent({ id: "ist-a", shift: "IST", openCount: 2 }), agent({ id: "ist-b", shift: "IST", openCount: 1 })];
    expect(chooseAgent(pool, ctx({ activeShift: "GST", withinBusinessHours: false }))).toEqual({ agent: pool[1], rule: "round_robin" });
  });

  it("breaks load ties deterministically by id", () => {
    const pool = [agent({ id: "zed" }), agent({ id: "amy" })];
    expect(chooseAgent(pool, ctx()).agent?.id).toBe("amy");
  });

  it("does not mutate the candidate list", () => {
    const pool = [agent({ id: "b", openCount: 2 }), agent({ id: "a", openCount: 1 })];
    chooseAgent(pool, ctx());
    expect(pool.map((a) => a.id)).toEqual(["b", "a"]);
  });
});

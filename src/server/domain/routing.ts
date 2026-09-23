/**
 * Lead routing (§17 §7.3) — pure. The service loads candidates and context;
 * this decides. Rules apply in the documented order:
 *
 *  1. Returning customer → previously assigned agent, if available
 *  2. Tier D / value above the premium threshold → senior (agent_lead or 'premium' skill)
 *  3. UAE-resident (AED or +971) → UAE-shift agent
 *  4. Skill match (groups → 'groups', dietary → 'jain' etc.)
 *  5. Round-robin among available agents under max_concurrent (least loaded first)
 *  6. Out of hours → prefer the shift that is on; queue if nobody is available
 */

export interface AgentCandidate {
  id: string;
  status: "available" | "busy" | "away" | "offline";
  maxConcurrent: number;
  openCount: number;
  skills: string[];
  shift: string; // 'IST' | 'GST'
  roles: string[];
}

export interface RoutingContext {
  totalInrMinor: bigint;
  guests: number;
  currency: "INR" | "AED";
  countryCode: string;
  hasTierD: boolean;
  dietary?: string;
  previousAgentId?: string;
  withinBusinessHours: boolean;
  /** Which shift is "on" now, from the SLA timezone: IST daytime → IST; late evening/night → GST. */
  activeShift: "IST" | "GST";
  premiumThresholdMinor: bigint;
  groupThreshold: number;
  maxConcurrentDefault: number;
}

function hasCapacity(a: AgentCandidate, ctx: RoutingContext) {
  const cap = a.maxConcurrent > 0 ? a.maxConcurrent : ctx.maxConcurrentDefault;
  return a.status === "available" && a.openCount < cap;
}

function leastLoaded(pool: AgentCandidate[]): AgentCandidate | null {
  if (!pool.length) return null;
  return [...pool].sort((a, b) => a.openCount - b.openCount || a.id.localeCompare(b.id))[0];
}

export function chooseAgent(candidates: AgentCandidate[], ctx: RoutingContext): { agent: AgentCandidate | null; rule: string } {
  const eligible = candidates.filter((a) => hasCapacity(a, ctx));
  if (!eligible.length) return { agent: null, rule: "no_capacity" };

  // 1. relationship continuity
  if (ctx.previousAgentId) {
    const prev = eligible.find((a) => a.id === ctx.previousAgentId);
    if (prev) return { agent: prev, rule: "returning_customer" };
  }

  // 2. premium / Tier D
  if (ctx.hasTierD || ctx.totalInrMinor >= ctx.premiumThresholdMinor) {
    const senior = eligible.filter((a) => a.roles.includes("agent_lead") || a.skills.includes("premium") || a.skills.includes("luxury"));
    const pick = leastLoaded(senior);
    if (pick) return { agent: pick, rule: "premium" };
  }

  // 3. UAE resident → UAE shift
  if (ctx.currency === "AED" || ctx.countryCode === "+971") {
    const uae = eligible.filter((a) => a.shift === "GST" || a.skills.includes("uae-shift"));
    const pick = leastLoaded(uae);
    if (pick) return { agent: pick, rule: "uae_shift" };
  }

  // 4. skill match
  const wanted: string[] = [];
  if (ctx.guests >= ctx.groupThreshold) wanted.push("groups");
  if (ctx.dietary === "jain") wanted.push("jain");
  if (wanted.length) {
    const skilled = eligible.filter((a) => wanted.some((s) => a.skills.includes(s)));
    const pick = leastLoaded(skilled);
    if (pick) return { agent: pick, rule: `skill:${wanted.join("+")}` };
  }

  // 5/6. round-robin, preferring the shift that is on
  const onShift = eligible.filter((a) => a.shift === ctx.activeShift);
  const pick = leastLoaded(onShift.length ? onShift : eligible);
  return { agent: pick, rule: onShift.length ? "round_robin_on_shift" : "round_robin" };
}

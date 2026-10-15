import type { Goals, Partner, TopPick } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  applyGoals,
  applyGoalsToKinds,
  computeGoalFit,
  filterByGoals,
  hasAnyGoal,
  rerankTopPicks,
  summarizeGoals,
} from "./goals.js";

const DEFAULT_GOALS: Goals = { wants: [], reach: "local_and_brands", appetite: "medium", avoid: [] };

function goals(overrides: Partial<Goals>): Goals {
  return { ...DEFAULT_GOALS, ...overrides };
}

function makePartner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: "p1",
    name: "Aesop",
    kind: "retail",
    entityType: "brand",
    blurb: "Quiet stores and plain packaging.",
    local: false,
    matchScore: 80,
    surprise: 0.3,
    isSurprising: false,
    reasons: [],
    sharedTags: ["design"],
    tags: ["design"],
    signals: { affinityToPartner: 0.8, affinityFromPartner: 0.7, tagOverlap: 0.5, localPopularity: 0.5, trend: 0.2 },
    evidence: [],
    relatedIds: [],
    ...overrides,
  };
}

describe("hasAnyGoal", () => {
  it("is false for undefined or the all-default shape", () => {
    expect(hasAnyGoal(undefined)).toBe(false);
    expect(hasAnyGoal(DEFAULT_GOALS)).toBe(false);
  });

  it("is true once any field departs from its default", () => {
    expect(hasAnyGoal(goals({ wants: ["footfall"] }))).toBe(true);
    expect(hasAnyGoal(goals({ reach: "near" }))).toBe(true);
    expect(hasAnyGoal(goals({ appetite: "ambitious" }))).toBe(true);
    expect(hasAnyGoal(goals({ avoid: ["food"] }))).toBe(true);
  });
});

describe("computeGoalFit", () => {
  it("returns a neutral 0.5 when no goals are set, without touching matchScore", () => {
    const partner = makePartner({ matchScore: 77 });
    expect(computeGoalFit(partner, undefined)).toBe(0.5);
    expect(partner.matchScore).toBe(77);
  });

  it("reach 'near' boosts local partners' goalFit over non-local ones with an identical matchScore", () => {
    const want = goals({ reach: "near" });
    const local = makePartner({ id: "local", local: true, matchScore: 82 });
    const notLocal = makePartner({ id: "brand", local: false, matchScore: 82 });

    const localFit = computeGoalFit(local, want);
    const brandFit = computeGoalFit(notLocal, want);

    expect(localFit).toBeGreaterThan(brandFit);
    expect(local.matchScore).toBe(82);
    expect(notLocal.matchScore).toBe(82);
  });

  it("wants boosts kinds with a higher affinity for that goal", () => {
    const want = goals({ wants: ["events"] }); // events favours venue/music over retail
    const venue = makePartner({ id: "venue", kind: "venue" });
    const retail = makePartner({ id: "retail", kind: "retail" });
    expect(computeGoalFit(venue, want)).toBeGreaterThan(computeGoalFit(retail, want));
  });

  it("avoid forces goalFit to 0 regardless of other preferences, matched case-insensitively", () => {
    const want = goals({ reach: "near", avoid: ["Retail"] });
    const partner = makePartner({ kind: "retail", local: true });
    expect(computeGoalFit(partner, want)).toBe(0);
  });

  it("always returns a value between 0 and 1", () => {
    const want = goals({ wants: ["footfall", "content"], reach: "anywhere", appetite: "light" });
    for (const local of [true, false]) {
      for (const kind of ["retail", "venue", "fitness"] as const) {
        const fit = computeGoalFit(makePartner({ local, kind }), want);
        expect(fit).toBeGreaterThanOrEqual(0);
        expect(fit).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("applyGoals", () => {
  it("leaves partners (and matchScore) untouched when no goals are set", () => {
    const partners = [makePartner({ id: "a" }), makePartner({ id: "b" })];
    const result = applyGoals(partners, undefined);
    expect(result).toBe(partners);
    expect(result.every((partner) => partner.goalFit === undefined)).toBe(true);
  });

  it("attaches goalFit without mutating matchScore when goals are set", () => {
    const want = goals({ reach: "near" });
    const partners = [makePartner({ id: "a", local: true, matchScore: 70 }), makePartner({ id: "b", local: false, matchScore: 90 })];
    const result = applyGoals(partners, want);
    expect(result.find((p) => p.id === "a")?.goalFit).toBeGreaterThan(result.find((p) => p.id === "b")?.goalFit ?? 1);
    expect(result.find((p) => p.id === "a")?.matchScore).toBe(70);
    expect(result.find((p) => p.id === "b")?.matchScore).toBe(90);
  });
});

describe("applyGoalsToKinds", () => {
  it("returns the same order when no goals are set", () => {
    const kinds = ["food", "venue", "retail"] as const;
    expect(applyGoalsToKinds([...kinds], undefined)).toEqual([...kinds]);
  });

  it("drops a kind named in avoid", () => {
    const result = applyGoalsToKinds(["food", "venue", "retail"], goals({ avoid: ["venue"] }));
    expect(result).not.toContain("venue");
  });

  it("never empties the list even if avoid would remove everything", () => {
    const result = applyGoalsToKinds(["food", "venue"], goals({ avoid: ["food", "venue"] }));
    expect(result.length).toBe(2);
  });

  it("prioritises kinds that best match the stated wants", () => {
    const result = applyGoalsToKinds(["retail", "venue"], goals({ wants: ["events"] }));
    expect(result[0]).toBe("venue");
  });
});

describe("filterByGoals", () => {
  const pool = [
    makePartner({ id: "local-1", local: true }),
    makePartner({ id: "local-2", local: true }),
    makePartner({ id: "local-3", local: true }),
    makePartner({ id: "local-4", local: true }),
    makePartner({ id: "local-5", local: true }),
    makePartner({ id: "local-6", local: true }),
    makePartner({ id: "brand-1", local: false }),
    makePartner({ id: "brand-2", local: false }),
  ];

  it("does nothing when no goals are set", () => {
    const result = filterByGoals(pool, undefined);
    expect(result.partners).toBe(pool);
    expect(result.note).toBeUndefined();
  });

  it("keeps only local partners for reach 'near' when enough remain above the floor", () => {
    const result = filterByGoals(pool, goals({ reach: "near" }), 3);
    expect(result.partners.every((partner) => partner.local)).toBe(true);
    expect(result.partners.length).toBe(6);
  });

  it("skips the reach filter rather than dropping below the floor", () => {
    const smallPool = [
      makePartner({ id: "local-1", local: true }),
      makePartner({ id: "local-2", local: true }),
      makePartner({ id: "brand-1", local: false }),
      makePartner({ id: "brand-2", local: false }),
    ];
    const result = filterByGoals(smallPool, goals({ reach: "near" }), 3);
    expect(result.partners.length).toBe(smallPool.length);
  });

  it("drops partners matching avoid and notes it", () => {
    const withKinds = [
      makePartner({ id: "a", kind: "retail" }),
      makePartner({ id: "b", kind: "retail" }),
      makePartner({ id: "c", kind: "retail" }),
      makePartner({ id: "d", kind: "food" }),
    ];
    const result = filterByGoals(withKinds, goals({ avoid: ["food"] }), 2);
    expect(result.partners.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(result.note).toMatch(/avoid/i);
  });
});

describe("summarizeGoals", () => {
  it("mentions every active preference", () => {
    const summary = summarizeGoals(goals({ wants: ["footfall"], appetite: "light", avoid: ["food"] }));
    expect(summary).toMatch(/footfall/i);
    expect(summary).toMatch(/light/i);
    expect(summary).toMatch(/food/i);
  });

  it("says nothing was set when goals are all default", () => {
    expect(summarizeGoals(DEFAULT_GOALS)).toMatch(/no fine-tune preferences/i);
  });
});

describe("rerankTopPicks", () => {
  it("does nothing when no goals are set", () => {
    const partners = [makePartner({ id: "a", matchScore: 90 }), makePartner({ id: "b", matchScore: 88 })];
    const topPicks: TopPick[] = [{ role: "best_local", partnerId: "a", headline: "x" }];
    const result = rerankTopPicks(partners, topPicks, undefined);
    expect(result.topPicks).toEqual(topPicks);
    expect(result.notes).toEqual([]);
  });

  it("never touches the best_overall pick", () => {
    const partners = [
      makePartner({ id: "overall", matchScore: 90, local: false, goalFit: 0.2 }),
      makePartner({ id: "challenger", matchScore: 89, local: true, goalFit: 0.95 }),
    ];
    const topPicks: TopPick[] = [{ role: "best_overall", partnerId: "overall", headline: "x" }];
    const result = rerankTopPicks(partners, topPicks, goals({ reach: "near" }));
    expect(result.topPicks[0]?.partnerId).toBe("overall");
    expect(result.notes).toEqual([]);
  });

  it("swaps a close, lower-goalFit pick for a near-tied partner with a much better fit", () => {
    const partners = [
      makePartner({ id: "overall", matchScore: 95, goalFit: 0.5 }),
      makePartner({ id: "current-local", matchScore: 80, local: false, goalFit: 0.3 }),
      makePartner({ id: "better-local", matchScore: 78, local: true, goalFit: 0.9 }),
    ];
    const topPicks: TopPick[] = [
      { role: "best_overall", partnerId: "overall", headline: "x" },
      { role: "best_local", partnerId: "current-local", headline: "y" },
    ];
    const result = rerankTopPicks(partners, topPicks, goals({ reach: "near" }), 4);
    const localPick = result.topPicks.find((pick) => pick.role === "best_local");
    expect(localPick?.partnerId).toBe("better-local");
    expect(result.notes.length).toBe(1);
    for (const partner of partners) expect(partner.matchScore).toBeGreaterThanOrEqual(78);
  });

  it("keeps the current pick when no competitor is close enough in score", () => {
    const partners = [
      makePartner({ id: "overall", matchScore: 95, goalFit: 0.5 }),
      makePartner({ id: "current-local", matchScore: 80, local: false, goalFit: 0.3 }),
      makePartner({ id: "far-local", matchScore: 60, local: true, goalFit: 0.9 }),
    ];
    const topPicks: TopPick[] = [
      { role: "best_overall", partnerId: "overall", headline: "x" },
      { role: "best_local", partnerId: "current-local", headline: "y" },
    ];
    const result = rerankTopPicks(partners, topPicks, goals({ reach: "near" }), 4);
    expect(result.topPicks.find((pick) => pick.role === "best_local")?.partnerId).toBe("current-local");
    expect(result.notes).toEqual([]);
  });
});

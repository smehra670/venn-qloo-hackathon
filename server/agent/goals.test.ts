import type { Goals, Partner, TopPick } from "@shared/types";
import { describe, expect, it } from "vitest";
import { applyGoals, computeGoalFit, hasAnyGoal, rerankTopPicks, summarizeGoals } from "./goals.js";

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
  it("is false for undefined or an empty object", () => {
    expect(hasAnyGoal(undefined)).toBe(false);
    expect(hasAnyGoal({})).toBe(false);
  });

  it("is true once any field is set", () => {
    expect(hasAnyGoal({ preferLocal: true })).toBe(true);
    expect(hasAnyGoal({ avoidKinds: ["food"] })).toBe(true);
    expect(hasAnyGoal({ notes: "keep it small" })).toBe(true);
  });
});

describe("computeGoalFit", () => {
  it("returns a neutral 0.5 when no goals are set, without touching matchScore", () => {
    const partner = makePartner({ matchScore: 77 });
    expect(computeGoalFit(partner, undefined)).toBe(0.5);
    expect(partner.matchScore).toBe(77);
  });

  it("preferLocal boosts local partners' goalFit over non-local ones with an identical matchScore", () => {
    const goals: Goals = { preferLocal: true };
    const local = makePartner({ id: "local", local: true, matchScore: 82 });
    const notLocal = makePartner({ id: "brand", local: false, matchScore: 82 });

    const localFit = computeGoalFit(local, goals);
    const brandFit = computeGoalFit(notLocal, goals);

    expect(localFit).toBeGreaterThan(brandFit);
    // matchScore is never touched by goal fit.
    expect(local.matchScore).toBe(82);
    expect(notLocal.matchScore).toBe(82);
  });

  it("preferSurprising boosts surprising partners over safe ones", () => {
    const goals: Goals = { preferSurprising: true };
    const wildcard = makePartner({ id: "wild", isSurprising: true, surprise: 0.8 });
    const safe = makePartner({ id: "safe", isSurprising: false, surprise: 0.1 });
    expect(computeGoalFit(wildcard, goals)).toBeGreaterThan(computeGoalFit(safe, goals));
  });

  it("avoidKinds forces goalFit to 0 regardless of other preferences", () => {
    const goals: Goals = { preferLocal: true, avoidKinds: ["retail"] };
    const partner = makePartner({ kind: "retail", local: true });
    expect(computeGoalFit(partner, goals)).toBe(0);
  });

  it("always returns a value between 0 and 1", () => {
    const goals: Goals = { preferLocal: true, preferSurprising: true, budget: "low" };
    for (const local of [true, false]) {
      for (const isSurprising of [true, false]) {
        const fit = computeGoalFit(makePartner({ local, isSurprising }), goals);
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
    const partners = [makePartner({ id: "a", local: true, matchScore: 70 }), makePartner({ id: "b", local: false, matchScore: 90 })];
    const result = applyGoals(partners, { preferLocal: true });
    expect(result.find((p) => p.id === "a")?.goalFit).toBeGreaterThan(result.find((p) => p.id === "b")?.goalFit ?? 1);
    expect(result.find((p) => p.id === "a")?.matchScore).toBe(70);
    expect(result.find((p) => p.id === "b")?.matchScore).toBe(90);
  });
});

describe("summarizeGoals", () => {
  it("mentions every active preference", () => {
    const summary = summarizeGoals({ preferLocal: true, budget: "low", avoidKinds: ["food"] });
    expect(summary).toMatch(/local/i);
    expect(summary).toMatch(/low/i);
    expect(summary).toMatch(/food/i);
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
    const result = rerankTopPicks(partners, topPicks, { preferLocal: true });
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
    const result = rerankTopPicks(partners, topPicks, { preferLocal: true }, 4);
    const localPick = result.topPicks.find((pick) => pick.role === "best_local");
    expect(localPick?.partnerId).toBe("better-local");
    expect(result.notes.length).toBe(1);
    // matchScore of every partner is unchanged.
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
    const result = rerankTopPicks(partners, topPicks, { preferLocal: true }, 4);
    expect(result.topPicks.find((pick) => pick.role === "best_local")?.partnerId).toBe("current-local");
    expect(result.notes).toEqual([]);
  });
});

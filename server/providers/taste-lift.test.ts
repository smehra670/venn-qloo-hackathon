import { describe, expect, it } from "vitest";
import { applyPopularityLift, computePopularityLift } from "./taste-lift.js";

describe("computePopularityLift", () => {
  it("returns an empty map for an empty batch", () => {
    expect(computePopularityLift([])).toEqual(new Map());
  });

  it("gives a single point zero residual (nothing to regress against)", () => {
    const result = computePopularityLift([{ id: "a", popularity: 0.6, affinity: 0.8 }]);
    expect(result.get("a")).toBe(0);
  });

  it("gives near-zero residuals when affinity is a perfect linear function of popularity", () => {
    const points = [
      { id: "a", popularity: 0.1, affinity: 0.2 },
      { id: "b", popularity: 0.4, affinity: 0.5 },
      { id: "c", popularity: 0.7, affinity: 0.8 },
      { id: "d", popularity: 1.0, affinity: 1.1 },
    ];
    const result = computePopularityLift(points);
    for (const point of points) {
      expect(result.get(point.id)).toBeCloseTo(0, 5);
    }
  });

  it("gives positive lift to a point whose affinity beats the popularity trend, negative to one that lags", () => {
    // A clear upward popularity~affinity trend (8 points, exactly y = x) dominates the fit,
    // plus one point far above the line (low popularity, surprisingly high affinity) and one
    // far below it (high popularity, surprisingly low affinity).
    const trend = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9].map((value) => ({
      id: `trend-${value}`,
      popularity: value,
      affinity: value,
    }));
    const points = [
      ...trend,
      { id: "low-pop-high-affinity", popularity: 0.1, affinity: 0.9 },
      { id: "high-pop-low-affinity", popularity: 0.9, affinity: 0.1 },
    ];
    const result = computePopularityLift(points);
    expect(result.get("low-pop-high-affinity")).toBeGreaterThan(0.4);
    expect(result.get("high-pop-low-affinity")).toBeLessThan(-0.4);
  });

  it("falls back to deviation from mean affinity when popularity has no variance", () => {
    const points = [
      { id: "a", popularity: 0.5, affinity: 0.8 },
      { id: "b", popularity: 0.5, affinity: 0.2 },
    ];
    const result = computePopularityLift(points);
    // mean affinity is 0.5; no popularity variance to regress against, so residual = affinity - mean
    expect(result.get("a")).toBeCloseTo(0.3, 5);
    expect(result.get("b")).toBeCloseTo(-0.3, 5);
  });

  it("residuals sum to (approximately) zero across the batch — OLS property", () => {
    const points = [
      { id: "a", popularity: 0.2, affinity: 0.9 },
      { id: "b", popularity: 0.5, affinity: 0.3 },
      { id: "c", popularity: 0.8, affinity: 0.6 },
      { id: "d", popularity: 0.3, affinity: 0.1 },
    ];
    const result = computePopularityLift(points);
    const sum = [...result.values()].reduce((acc, value) => acc + value, 0);
    expect(sum).toBeCloseTo(0, 5);
  });

  it("is deterministic for the same input", () => {
    const points = [
      { id: "a", popularity: 0.3, affinity: 0.4 },
      { id: "b", popularity: 0.6, affinity: 0.2 },
    ];
    const first = computePopularityLift(points);
    const second = computePopularityLift(points);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});

function partner(id: string, popularity: number, affinity: number) {
  return {
    id,
    name: id,
    kind: "retail" as const,
    entityType: "brand" as const,
    blurb: "",
    local: false,
    matchScore: 70,
    surprise: 0,
    isSurprising: false,
    reasons: [],
    sharedTags: [],
    tags: [],
    signals: { affinityToPartner: affinity, affinityFromPartner: affinity, tagOverlap: 0, localPopularity: popularity, trend: 0 },
    evidence: [],
    relatedIds: [],
  };
}

describe("applyPopularityLift", () => {
  it("adds popularityLift to every partner without touching matchScore", () => {
    const partners = [
      partner("a", 0.1, 0.9),
      partner("b", 0.5, 0.5),
      partner("c", 0.9, 0.1),
    ];
    const lifted = applyPopularityLift(partners);
    expect(lifted).toHaveLength(3);
    for (const [index, p] of lifted.entries()) {
      expect(p.popularityLift).toBeTypeOf("number");
      expect(p.matchScore).toBe(partners[index]?.matchScore);
    }
    // a: low popularity but matches b/c's implied anti-trend only weakly; with a perfectly
    // linear 3-point anti-correlation (y = 1 - x) the OLS fit passes through all three points,
    // so every residual is exactly zero — this exercises that degenerate-but-valid case.
    expect(lifted[0]?.popularityLift).toBeCloseTo(0, 5);
    expect(lifted[1]?.popularityLift).toBeCloseTo(0, 5);
    expect(lifted[2]?.popularityLift).toBeCloseTo(0, 5);
  });

  it("gives opposite-signed lift to partners that over- and under-perform the popularity trend", () => {
    const partners = [
      partner("trend-1", 0.1, 0.1),
      partner("trend-2", 0.3, 0.3),
      partner("trend-3", 0.5, 0.5),
      partner("trend-4", 0.7, 0.7),
      partner("trend-5", 0.9, 0.9),
      partner("under", 0.9, 0.1),
      partner("over", 0.1, 0.9),
    ];
    const lifted = applyPopularityLift(partners);
    const byId = new Map(lifted.map((p) => [p.id, p]));
    expect(byId.get("over")?.popularityLift ?? 0).toBeGreaterThan(0);
    expect(byId.get("under")?.popularityLift ?? 0).toBeLessThan(0);
    for (const [index, p] of lifted.entries()) {
      expect(p.matchScore).toBe(partners[index]?.matchScore);
    }
  });

  it("returns an empty array unchanged", () => {
    expect(applyPopularityLift([])).toEqual([]);
  });
});

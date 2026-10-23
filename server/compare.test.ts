import type { Partner, RunResult } from "@shared/types";
import { describe, expect, it } from "vitest";
import { buildCompare, normalizeCompareTags } from "./compare.js";

function partner(overrides: Partial<Partner>): Partner {
  return {
    id: "p1",
    name: "Aesop",
    kind: "retail",
    entityType: "brand",
    blurb: "",
    local: false,
    matchScore: 80,
    surprise: 0.3,
    isSurprising: false,
    reasons: [],
    sharedTags: ["minimalist"],
    tags: ["minimalist", "skincare"],
    signals: {
      affinityToPartner: 0.7,
      affinityFromPartner: 0.6,
      tagOverlap: 0.5,
      localPopularity: 0.4,
      trend: 0.3,
    },
    evidence: [],
    relatedIds: [],
    ...overrides,
  };
}

function result(partners: Partner[]): RunResult {
  return {
    runId: "run1",
    createdAt: Date.now(),
    provider: "mock",
    providerLabel: "Demo data",
    input: { businessType: "cafe", city: "London", anchors: ["Aesop"] },
    resolvedAnchors: [],
    plannedKinds: [],
    partners,
    topPicks: [],
    city: null,
    headline: "Test",
    notes: [],
    limits: [],
    stats: { candidatesConsidered: 0, retries: 0, toolCalls: 0, elapsedMs: 0 },
  };
}

describe("buildCompare", () => {
  it("compares a partner's signals against the median of the rest of the run", async () => {
    const target = partner({ id: "p1", name: "Aesop", signals: { affinityToPartner: 0.8, affinityFromPartner: 0.7, tagOverlap: 0.6, localPopularity: 0.8, trend: 0.5 } });
    const other1 = partner({ id: "p2", name: "Other 1", signals: { affinityToPartner: 0.4, affinityFromPartner: 0.3, tagOverlap: 0.2, localPopularity: 0.2, trend: 0.2 } });
    const other2 = partner({ id: "p3", name: "Other 2", signals: { affinityToPartner: 0.5, affinityFromPartner: 0.4, tagOverlap: 0.3, localPopularity: 0.4, trend: 0.3 } });
    const run = result([target, other1, other2]);

    const payload = await buildCompare(run, target);
    expect(payload.partnerId).toBe("p1");
    expect(payload.partnerName).toBe("Aesop");
    expect(payload.sharedTags).toEqual(["minimalist"]);
    expect(payload.affinityToPartner).toBe(0.8);
    expect(payload.affinityFromPartner).toBe(0.7);
    // median local popularity of the two peers is (0.2 + 0.4) / 2 = 0.3
    expect(payload.popularityDelta).toBeCloseTo(0.8 - 0.3, 5);
    expect(payload.signals).toHaveLength(4);
    const popularitySignal = payload.signals.find((signal) => signal.label.toLowerCase().includes("popularity"));
    expect(popularitySignal?.value).toBe(0.8);
    expect(popularitySignal?.median).toBeCloseTo(0.3, 5);
    expect(payload.source).toBe("computed_from_tags");
  });

  it("excludes user-added partners from the comparison baseline", async () => {
    const target = partner({ id: "p1" });
    const userAdded = partner({ id: "p2", userAdded: true, signals: { affinityToPartner: 0.99, affinityFromPartner: 0.99, tagOverlap: 0.99, localPopularity: 0.99, trend: 0.99 } });
    const run = result([target, userAdded]);

    const payload = await buildCompare(run, target);
    // With no non-user-added peers, the median falls back to the target's own signal.
    expect(payload.popularityDelta).toBe(0);
  });

  it("is deterministic across repeated calls with the same input", async () => {
    const target = partner({ id: "p1" });
    const other = partner({ id: "p2", name: "Other" });
    const run = result([target, other]);
    const first = await buildCompare(run, target);
    const second = await buildCompare(run, target);
    expect(first).toEqual(second);
  });

  it("uses the live qloo tags when tryLive resolves a non-empty normalised list", async () => {
    const target = partner({ id: "p1", name: "Aesop" });
    const other = partner({ id: "p2", name: "Other" });
    const run = result([target, other]);

    const payload = await buildCompare(run, target, async () => [
      { label: "minimalist", a: 0.8, b: 0.7 },
      { label: "quiet_design", a: 0.6, b: 0.5 },
    ]);
    expect(payload.source).toBe("qloo_tags");
    expect(payload.sharedTags).toEqual(["minimalist", "quiet_design"]);
  });

  it("falls back to computed_from_tags when tryLive resolves null (empty qloo tags)", async () => {
    const target = partner({ id: "p1", name: "Aesop" });
    const other = partner({ id: "p2", name: "Other" });
    const run = result([target, other]);

    const payload = await buildCompare(run, target, async () => null);
    expect(payload.source).toBe("computed_from_tags");
    expect(payload.sharedTags).toEqual(target.sharedTags);
  });

  it("falls back to computed_from_tags when tryLive throws", async () => {
    const target = partner({ id: "p1", name: "Aesop" });
    const other = partner({ id: "p2", name: "Other" });
    const run = result([target, other]);

    const payload = await buildCompare(run, target, async () => {
      throw new Error("network error");
    });
    expect(payload.source).toBe("computed_from_tags");
  });
});

describe("normalizeCompareTags", () => {
  it("returns null for an empty or non-array input, so callers fall back", () => {
    expect(normalizeCompareTags([])).toBeNull();
    expect(normalizeCompareTags(undefined)).toBeNull();
    expect(normalizeCompareTags(null)).toBeNull();
    expect(normalizeCompareTags("not an array")).toBeNull();
  });

  it("normalises a plausible {name, a, b} tag shape", () => {
    const tags = normalizeCompareTags([
      { name: "Minimalist", a: 0.9, b: 0.4 },
      { tag_id: "urn:tag:design", a: 0.5, b: 0.6 },
    ]);
    expect(tags).toEqual([
      { label: "Minimalist", a: 0.9, b: 0.4 },
      { label: "urn:tag:design", a: 0.5, b: 0.6 },
    ]);
  });

  it("normalises a nested {name, a: {affinity}, b: {affinity}} tag shape", () => {
    const tags = normalizeCompareTags([{ name: "Craft", a: { affinity: 0.7 }, b: { affinity: 0.2 } }]);
    expect(tags).toEqual([{ label: "Craft", a: 0.7, b: 0.2 }]);
  });

  it("skips entries with no usable label and returns null when nothing is left", () => {
    expect(normalizeCompareTags([{ a: 0.5, b: 0.5 }])).toBeNull();
  });

  it("clamps out-of-range scores into [0, 1]", () => {
    const tags = normalizeCompareTags([{ name: "Over", a: 5, b: -2 }]);
    expect(tags).toEqual([{ label: "Over", a: 1, b: 0 }]);
  });
});

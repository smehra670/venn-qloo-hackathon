import type { BusinessInput, Partner, TopPick } from "@shared/types";
import { describe, expect, it } from "vitest";
import { FakeLlmClient } from "../llm/fake.js";
import { NoneLlmClient } from "../llm/none.js";
import { SCORE_MIN } from "../providers/scoring.js";
import { applyFeasibility, applyCritiques, assessFeasibility, clampOneStep, critiqueFeasibility, flaggedPartners } from "./feasibility.js";

const cafe: BusinessInput = { businessType: "cafe", city: "London", anchors: ["Aesop"] };

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

describe("clampOneStep", () => {
  it("allows a one-step move either direction", () => {
    expect(clampOneStep("easy", "warm_intro")).toBe("warm_intro");
    expect(clampOneStep("long_shot", "warm_intro")).toBe("warm_intro");
  });

  it("clamps a two-step jump down to one step", () => {
    expect(clampOneStep("easy", "long_shot")).toBe("warm_intro");
    expect(clampOneStep("long_shot", "easy")).toBe("warm_intro");
  });

  it("is a no-op when the suggestion matches or stays the same", () => {
    expect(clampOneStep("easy", "easy")).toBe("easy");
  });
});

describe("assessFeasibility", () => {
  it("rates a strong, differently-categorised partner with good evidence as easy", () => {
    const partner = makePartner({ kind: "retail", sharedTags: ["design", "craft"], matchScore: 88 });
    const result = assessFeasibility(partner, cafe);
    expect(result.level).toBe("easy");
  });

  it("flags a kind clash with the business's own category as a long shot", () => {
    // cafe's category is "food" — a food partner reads as a competitor, not a cross-promo partner.
    const partner = makePartner({ kind: "food", matchScore: 88 });
    const result = assessFeasibility(partner, cafe);
    expect(result.level).toBe("long_shot");
    expect(result.reason).toMatch(/competitor/);
  });

  it("rates thin evidence (no shared tags) as a warm intro, not a long shot", () => {
    const partner = makePartner({ sharedTags: [], matchScore: 88 });
    const result = assessFeasibility(partner, cafe);
    expect(result.level).toBe("warm_intro");
    expect(result.reason).toMatch(/shared tags/);
  });

  it("rates thin evidence plus a bottom-of-range score as a long shot", () => {
    const partner = makePartner({ sharedTags: [], matchScore: SCORE_MIN + 1 });
    const result = assessFeasibility(partner, cafe);
    expect(result.level).toBe("long_shot");
  });

  it("rates a local partner with no specific location as a warm intro", () => {
    const partner = makePartner({ local: true, locationLabel: undefined, matchScore: 88 });
    const result = assessFeasibility(partner, cafe);
    expect(result.level).toBe("warm_intro");
    expect(result.reason).toMatch(/neighbourhood/);
  });

  it("rates a match score near the bottom of the search's range as a warm intro", () => {
    const partner = makePartner({ matchScore: SCORE_MIN + 1 });
    const result = assessFeasibility(partner, cafe);
    expect(result.level).toBe("warm_intro");
    expect(result.reason).toMatch(/bottom of this search's range/);
  });
});

describe("applyFeasibility / flaggedPartners", () => {
  const partners: Partner[] = [
    makePartner({ id: "pick", kind: "retail", sharedTags: ["design"], matchScore: 88 }),
    makePartner({ id: "clash", kind: "food", sharedTags: ["design"], matchScore: 88 }),
    makePartner({ id: "not-picked", kind: "food", sharedTags: [], matchScore: 60 }),
  ];
  const topPicks: TopPick[] = [
    { role: "best_overall", partnerId: "pick", headline: "x" },
    { role: "best_local", partnerId: "clash", headline: "y" },
  ];

  it("only attaches feasibility (with origin 'rule') to partners that are in topPicks", () => {
    const result = applyFeasibility(partners, topPicks, cafe);
    expect(result.find((p) => p.id === "pick")?.feasibility?.origin).toBe("rule");
    expect(result.find((p) => p.id === "clash")?.feasibility).toBeDefined();
    expect(result.find((p) => p.id === "not-picked")?.feasibility).toBeUndefined();
  });

  it("flaggedPartners returns only the top picks whose feasibility is worse than easy", () => {
    const withFeasibility = applyFeasibility(partners, topPicks, cafe);
    const flagged = flaggedPartners(withFeasibility, topPicks);
    expect(flagged.map((p) => p.id)).toEqual(["clash"]);
  });
});

describe("critiqueFeasibility", () => {
  it("returns [] without calling the LLM when nothing is flagged", async () => {
    const llm = new FakeLlmClient();
    const result = await critiqueFeasibility([], llm);
    expect(result).toEqual([]);
    expect(llm.callCount).toBe(0);
  });

  it("returns [] when no LLM is configured", async () => {
    const flagged = [makePartner({ feasibility: { level: "long_shot", reason: "same category", origin: "rule" } })];
    const result = await critiqueFeasibility(flagged, new NoneLlmClient());
    expect(result).toEqual([]);
  });

  it("applies the fake LLM's suggestion, clamped to one step from the rule level", async () => {
    const flagged = [
      makePartner({ id: "daily-grind", name: "Daily Grind", feasibility: { level: "long_shot", reason: "same category", origin: "rule" } }),
    ];
    // The LLM suggests jumping straight to "easy" — critiqueFeasibility must clamp this to warm_intro.
    const llm = new FakeLlmClient({
      responses: [{ critiques: [{ name: "Daily Grind", level: "easy", reason: "Actually, the crowds barely overlap." }] }],
    });
    const result = await critiqueFeasibility(flagged, llm);
    expect(result).toEqual([{ partnerId: "daily-grind", level: "warm_intro", reason: "Actually, the crowds barely overlap." }]);
  });

  it("falls back to [] if the LLM throws", async () => {
    const flagged = [makePartner({ feasibility: { level: "long_shot", reason: "same category", origin: "rule" } })];
    const llm = new FakeLlmClient({ throwOnCall: 1 });
    const result = await critiqueFeasibility(flagged, llm);
    expect(result).toEqual([]);
  });
});

describe("applyCritiques", () => {
  it("overrides matching partners' feasibility with origin 'ai', leaving others untouched", () => {
    const partners = [
      makePartner({ id: "a", feasibility: { level: "long_shot", reason: "r1", origin: "rule" } }),
      makePartner({ id: "b", feasibility: { level: "warm_intro", reason: "r2", origin: "rule" } }),
    ];
    const result = applyCritiques(partners, [{ partnerId: "a", level: "warm_intro", reason: "nudged" }]);
    expect(result.find((p) => p.id === "a")?.feasibility).toEqual({ level: "warm_intro", reason: "nudged", origin: "ai" });
    expect(result.find((p) => p.id === "b")?.feasibility?.origin).toBe("rule");
  });
});

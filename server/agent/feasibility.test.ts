import type { BusinessInput, Partner, TopPick } from "@shared/types";
import { describe, expect, it } from "vitest";
import { FakeLlmClient } from "../llm/fake.js";
import { NoneLlmClient } from "../llm/none.js";
import { SCORE_MIN } from "../providers/scoring.js";
import { applyFeasibility, assessFeasibility, critiqueFeasibility, flaggedPartners } from "./feasibility.js";

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

describe("assessFeasibility", () => {
  it("passes a strong, differently-categorised partner with good evidence", () => {
    const partner = makePartner({ kind: "retail", sharedTags: ["design", "craft"], matchScore: 88 });
    const result = assessFeasibility(partner, cafe);
    expect(result.ok).toBe(true);
    expect(result.notes).toEqual([]);
  });

  it("flags a kind clash with the business's own category", () => {
    // cafe's category is "food" — a food partner reads as a competitor, not a cross-promo partner.
    const partner = makePartner({ kind: "food", matchScore: 88 });
    const result = assessFeasibility(partner, cafe);
    expect(result.ok).toBe(false);
    expect(result.notes.some((note) => note.includes("competitor"))).toBe(true);
  });

  it("flags thin evidence when there are no shared tags", () => {
    const partner = makePartner({ sharedTags: [], matchScore: 88 });
    const result = assessFeasibility(partner, cafe);
    expect(result.ok).toBe(false);
    expect(result.notes.some((note) => note.includes("thin"))).toBe(true);
  });

  it("notes (without failing) a local partner that has no specific location on file", () => {
    const partner = makePartner({ local: true, locationLabel: undefined, matchScore: 88 });
    const result = assessFeasibility(partner, cafe);
    expect(result.ok).toBe(true);
    expect(result.notes.some((note) => note.includes("neighbourhood"))).toBe(true);
  });

  it("notes a match score near the bottom of the search's range", () => {
    const partner = makePartner({ matchScore: SCORE_MIN + 1 });
    const result = assessFeasibility(partner, cafe);
    expect(result.notes.some((note) => note.includes("bottom of this search's range"))).toBe(true);
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

  it("only attaches feasibility to partners that are in topPicks", () => {
    const result = applyFeasibility(partners, topPicks, cafe);
    expect(result.find((p) => p.id === "pick")?.feasibility).toBeDefined();
    expect(result.find((p) => p.id === "clash")?.feasibility).toBeDefined();
    expect(result.find((p) => p.id === "not-picked")?.feasibility).toBeUndefined();
  });

  it("flaggedPartners returns only the top picks whose feasibility failed", () => {
    const withFeasibility = applyFeasibility(partners, topPicks, cafe);
    const flagged = flaggedPartners(withFeasibility, topPicks);
    expect(flagged.map((p) => p.id)).toEqual(["clash"]);
  });
});

describe("critiqueFeasibility", () => {
  it("returns null without calling the LLM when nothing is flagged", async () => {
    const llm = new FakeLlmClient();
    const result = await critiqueFeasibility([], llm);
    expect(result).toBeNull();
    expect(llm.callCount).toBe(0);
  });

  it("returns null when no LLM is configured", async () => {
    const flagged = [makePartner({ feasibility: { ok: false, notes: ["same category"] } })];
    const result = await critiqueFeasibility(flagged, new NoneLlmClient());
    expect(result).toBeNull();
  });

  it("returns the fake LLM's critique text for flagged partners", async () => {
    const flagged = [makePartner({ name: "Daily Grind", feasibility: { ok: false, notes: ["same category as your cafe"] } })];
    const llm = new FakeLlmClient({ responses: [{ critique: "Daily Grind is a direct competitor — treat this as a stretch pick." }] });
    const result = await critiqueFeasibility(flagged, llm);
    expect(result).toBe("Daily Grind is a direct competitor — treat this as a stretch pick.");
  });

  it("falls back to null if the LLM throws", async () => {
    const flagged = [makePartner({ feasibility: { ok: false, notes: ["same category"] } })];
    const llm = new FakeLlmClient({ throwOnCall: 1 });
    const result = await critiqueFeasibility(flagged, llm);
    expect(result).toBeNull();
  });
});

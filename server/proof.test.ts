import type { Partner, RunResult } from "@shared/types";
import { describe, expect, it } from "vitest";
import { FakeLlmClient } from "./llm/fake.js";
import { NoneLlmClient } from "./llm/none.js";
import { buildProof } from "./proof.js";

function makePartner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: "p1",
    name: "Aesop",
    kind: "retail",
    entityType: "brand",
    blurb: "Quiet stores and plain packaging.",
    local: false,
    matchScore: 90,
    surprise: 0.3,
    isSurprising: false,
    reasons: [],
    sharedTags: [],
    tags: [],
    signals: { affinityToPartner: 0.8, affinityFromPartner: 0.7, tagOverlap: 0.5, localPopularity: 0.3, trend: 0.2 },
    evidence: [],
    relatedIds: [],
    ...overrides,
  };
}

function makeResult(partners: Partner[]): RunResult {
  return {
    runId: "run-1",
    createdAt: Date.now(),
    provider: "mock",
    providerLabel: "Demo data",
    input: { businessType: "cafe", city: "London", anchors: ["Aesop"] },
    resolvedAnchors: [],
    plannedKinds: ["retail"],
    partners,
    topPicks: partners[0] ? [{ role: "best_overall", partnerId: partners[0].id, headline: "Closest overlap" }] : [],
    city: null,
    headline: "headline",
    notes: [],
    limits: [],
    stats: { candidatesConsidered: partners.length, retries: 0, toolCalls: 0, elapsedMs: 1 },
  };
}

describe("buildProof", () => {
  it("uses a deterministic popularity baseline when no LLM is configured", async () => {
    const partner = makePartner();
    const payload = await buildProof(makeResult([partner]), new NoneLlmClient());
    expect(payload.baseline).toBe("popularity");
    expect(payload.rows).toHaveLength(1);
    const expectedBaseline = Math.round((0.6 * 0.3 + 0.4 * 0.2) * 100);
    expect(payload.rows[0]?.baselineScore).toBe(expectedBaseline);
    expect(payload.rows[0]?.delta).toBe(partner.matchScore - expectedBaseline);
    expect(payload.narrative.length).toBeGreaterThan(0);
  });

  it("excludes user-added picks and caps at 8 rows, favouring top picks first", async () => {
    const partners = Array.from({ length: 12 }, (_, index) =>
      makePartner({ id: `p${index}`, name: `Partner ${index}`, matchScore: 60 + index }),
    );
    partners.push(makePartner({ id: "mine", name: "Mine", matchScore: 99, userAdded: true }));
    const payload = await buildProof(makeResult(partners), new NoneLlmClient());
    expect(payload.rows.every((row) => row.partnerId !== "mine")).toBe(true);
    expect(payload.rows.length).toBeLessThanOrEqual(8);
  });

  it("writes an AI narrative and reports baseline 'ai' when an LLM is configured", async () => {
    const llm = new FakeLlmClient({ responses: [{ narrative: "Aesop beats the baseline on real taste overlap." }] });
    const payload = await buildProof(makeResult([makePartner()]), llm);
    expect(payload.baseline).toBe("ai");
    expect(payload.narrative).toContain("Aesop beats the baseline");
  });

  it("falls back to the deterministic narrative when the llm throws, but keeps baseline 'ai'", async () => {
    const llm = new FakeLlmClient({ throwOnCall: 1 });
    const payload = await buildProof(makeResult([makePartner()]), llm);
    expect(payload.baseline).toBe("ai");
    expect(payload.narrative).toContain("popularity");
  });
});

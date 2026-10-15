import type { DiscoverSpec, Partner, PartnerKind, RankEntry, RunResult } from "@shared/types";
import { describe, expect, it } from "vitest";
import { config } from "./config.js";
import { FakeLlmClient } from "./llm/fake.js";
import { NoneLlmClient } from "./llm/none.js";
import { buildProof } from "./proof.js";
import type { Candidate, ProviderContext, TasteProvider } from "./providers/types.js";

function makeCtx(): ProviderContext {
  return {
    signal: new AbortController().signal,
    async trace(_tool, _args, fn) {
      return fn();
    },
    decide() {
      // no-op: tests don't inspect the decision log
    },
  };
}

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

function makeResult(partners: Partner[], discoverSpecs?: DiscoverSpec[]): RunResult {
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
    discoverSpecs,
  };
}

/** A minimal `TasteProvider` test double: `rankTogether` reads from a fixed lookup table
 * (keyed by entity id) instead of hitting any network, and `checkPartner` resolves a name to
 * a synthetic partner whose id is derived from the name — enough to exercise Proof's
 * resolve+rankTogether flow deterministically. */
function makeFakeProvider(rankById: Map<string, { affinity: number; popularity: number }>): TasteProvider {
  return {
    name: "mock",
    label: "fake",
    async resolveAnchors() {
      return [];
    },
    async resolveCity() {
      return null;
    },
    async planKinds() {
      return [];
    },
    async discover(): Promise<Candidate[]> {
      return [];
    },
    async score() {
      return [];
    },
    async enrich(_input, partners) {
      return partners;
    },
    async expand() {
      return [];
    },
    async heatmap() {
      return null;
    },
    async checkPartner(_input, _resolved, query) {
      const id = `baseline-${query.name.toLowerCase().replace(/\s+/g, "-")}`;
      return makePartner({
        id,
        name: query.name,
        kind: (query.entityHint as PartnerKind | undefined) ?? "retail",
        matchScore: 65,
      });
    },
    async rankTogether(spec: DiscoverSpec, extraEntityIds: string[]): Promise<RankEntry[]> {
      const ids = [...new Set([...spec.poolIds, ...extraEntityIds])];
      return ids
        .map((id) => {
          const entry = rankById.get(id);
          if (!entry) return null;
          return { entityId: id, affinity: entry.affinity, popularity: entry.popularity };
        })
        .filter((entry): entry is RankEntry => entry !== null);
    },
  };
}

describe("buildProof", () => {
  it("ranks Venn's picks against a popularity baseline from the same discover pool", async () => {
    const partners = [
      makePartner({ id: "p0", name: "Top Pick", matchScore: 90 }),
      makePartner({ id: "p1", name: "Second Pick", matchScore: 80 }),
      makePartner({ id: "p2", name: "Also Found", matchScore: 70 }),
    ];
    const spec: DiscoverSpec = {
      kind: "retail",
      entityType: "brand",
      params: {},
      poolIds: ["p0", "p1", "p2", "extra1"],
    };
    const rankById = new Map([
      ["p0", { affinity: 0.8, popularity: 0.3 }],
      ["p1", { affinity: 0.6, popularity: 0.4 }],
      ["p2", { affinity: 0.5, popularity: 0.2 }],
      ["extra1", { affinity: 0.1, popularity: 0.95 }],
    ]);
    const provider = makeFakeProvider(rankById);
    const result = makeResult(partners, [spec]);

    const payload = await buildProof(result, makeCtx(), { provider, llm: new NoneLlmClient() });

    expect(payload.legacy).toBe(false);
    expect(payload.baseline).toBe("popularity");
    expect(payload.calls).toHaveLength(1);
    expect(payload.calls[0]).toEqual({ callId: payload.calls[0]?.callId, kind: "retail", poolSize: 4 });

    const group = payload.perKind.find((item) => item.kind === "retail");
    expect(group).toBeDefined();
    // Venn's top 2 picks by matchScore, scored only from this one rankTogether response.
    expect(group?.vennItems.map((item) => item.entityId)).toEqual(["p0", "p1"]);
    expect(group?.vennItems.map((item) => item.score)).toEqual([80, 60]);
    // The most popular pooled id that isn't already a Venn pick — "extra1", not "p2".
    expect(group?.baselineItems.map((item) => item.entityId)).toEqual(["extra1"]);
    expect(group?.baselineItems[0]?.score).toBe(10);

    expect(payload.summary.kindsCompared).toBe(1);
    expect(payload.summary.avgVennScore).toBe(70);
    expect(payload.summary.avgBaselineScore).toBe(10);
    expect(payload.summary.avgDelta).toBe(60);
    expect(payload.summary.vennWins).toBe(1);
    expect(payload.summary.baselineWins).toBe(0);
    expect(payload.caveats.some((note) => note.includes("group-level"))).toBe(true);
  });

  it("falls back to a legacy message when the run has no discoverSpecs", async () => {
    const partners = [makePartner()];
    const result = makeResult(partners); // no discoverSpecs at all
    const provider = makeFakeProvider(new Map());

    const payload = await buildProof(result, makeCtx(), { provider, llm: new NoneLlmClient() });

    expect(payload.legacy).toBe(true);
    expect(payload.summary.kindsCompared).toBe(0);
    expect(payload.perKind.every((group) => group.vennItems.length === 0 && group.baselineItems.length === 0)).toBe(
      true,
    );
    expect(payload.perKind.some((group) => Boolean(group.note))).toBe(true);
    expect(payload.caveats.some((note) => note.toLowerCase().includes("predates"))).toBe(true);
  });

  it("resolves an AI-suggested baseline name via search and writes an AI narrative", async () => {
    const partners = [makePartner({ id: "p0", name: "Top Pick", matchScore: 90 })];
    const spec: DiscoverSpec = { kind: "retail", entityType: "brand", params: {}, poolIds: ["p0"] };
    const rankById = new Map([
      ["p0", { affinity: 0.4, popularity: 0.3 }],
      ["baseline-nike", { affinity: 0.95, popularity: 0.99 }],
    ]);
    const provider = makeFakeProvider(rankById);
    const result = makeResult(partners, [spec]);
    const llm = new FakeLlmClient({
      responses: [{ suggestions: { retail: "Nike" } }, { narrative: "Venn beats the obvious Nike pick here." }],
    });

    const payload = await buildProof(result, makeCtx(), { provider, llm });

    expect(payload.baseline).toBe("ai");
    const group = payload.perKind.find((item) => item.kind === "retail");
    expect(group?.baselineItems).toHaveLength(1);
    expect(group?.baselineItems[0]?.name).toBe("Nike");
    expect(group?.baselineItems[0]?.score).toBe(95);
    expect(payload.narrative).toContain("Nike");
  });

  it("stops comparing further kinds once the call budget is spent", async () => {
    const kinds: PartnerKind[] = ["retail", "food", "drink", "venue"];
    const partners = kinds.map((kind, index) => makePartner({ id: `p-${kind}`, name: kind, kind, matchScore: 90 - index }));
    const specs: DiscoverSpec[] = kinds.map((kind) => ({ kind, entityType: "brand", params: {}, poolIds: [`p-${kind}`] }));
    const rankById = new Map(kinds.map((kind) => [`p-${kind}`, { affinity: 0.5, popularity: 0.5 }]));
    for (const kind of kinds) rankById.set(`baseline-${kind.toLowerCase()}`, { affinity: 0.5, popularity: 0.5 });
    const provider = makeFakeProvider(rankById);
    const result = makeResult(partners, specs);
    // Every kind resolves an AI name (2 budget units: resolve + rankTogether), so 4 kinds would
    // need 8 units — more than the configured `PROOF_MAX_CALLS` default — forcing a skip.
    const llm = new FakeLlmClient({
      responses: [
        { suggestions: Object.fromEntries(kinds.map((kind) => [kind, kind])) },
        { narrative: "Comparison across several kinds." },
      ],
    });

    const payload = await buildProof(result, makeCtx(), { provider, llm });

    const skipped = payload.perKind.filter((group) => group.note === "Skipped: call budget reached.");
    expect(skipped.length).toBeGreaterThan(0);
    expect(payload.caveats.some((note) => note.includes("call budget"))).toBe(true);
    expect(payload.calls.length).toBeLessThan(kinds.length);
    expect(payload.calls.length).toBeLessThanOrEqual(config.proofMaxCalls);
  });
});

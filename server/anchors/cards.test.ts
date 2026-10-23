import { CardsResponse, RefillResponse, type CardsRequest } from "@shared/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QlooEntity } from "../providers/qloo/schemas.js";
import { setCardDataForTests, setCardsSnapshotForTests, type SeedIdsFile } from "./cardData.js";
import { CARD_CALL_BUDGET, createMockCardSource, createQlooCardSource, createSnapshotCardSource, type QlooCardDeps } from "./cards.js";
import { SEEDS } from "./seeds.js";

const cafe: CardsRequest = { businessType: "cafe", city: "Manchester" };

/** Seed ids for every cafe seed, as if `cards:seed` had resolved them all. */
function fakeSeedIds(): SeedIdsFile {
  const entries: SeedIdsFile["entries"] = {};
  const add = (kind: "brand" | "artist" | "topic", name: string) => {
    entries[`${kind}:${name.toLowerCase()}`] = {
      name,
      kind,
      id: kind === "topic" ? `urn:tag:interests:qloo:${name.toLowerCase().replace(/\s+/g, "_")}` : `ID-${name.toUpperCase().replace(/\W+/g, "")}`,
      type: kind === "topic" ? "tag" : `urn:entity:${kind}`,
    };
  };
  SEEDS.cafe.brands.forEach((name) => add("brand", name));
  SEEDS.cafe.artists.forEach((name) => add("artist", name));
  SEEDS.cafe.topics.forEach((name) => add("topic", name));
  return { generatedAt: "test", entries };
}

function fakeDeps(
  over: Partial<Omit<QlooCardDeps, "insights">> = {},
  insights = vi.fn(async (params: Record<string, unknown>): Promise<{ entities: QlooEntity[] }> => {
    const kind = String(params["filter.type"]).split(":").pop();
    return { entities: Array.from({ length: 5 }, (_, i) => ({ entity_id: `R-${kind}-${i}`, name: `Refill ${kind} ${i}` })) };
  }),
) {
  return { quotaLow: () => false, circuitOpen: () => false, ...over, insights };
}

afterEach(() => {
  setCardDataForTests({ seedIds: null, blocklist: null });
  setCardsSnapshotForTests(null);
});

describe("mock card source", () => {
  it("returns sample cards that never claim Qloo", async () => {
    const res = CardsResponse.parse(await createMockCardSource().getSwipeCards(cafe));
    expect(res.status).toBe("ok");
    expect(res.cards.length).toBeGreaterThanOrEqual(8);
    expect(res.cards.every((c) => c.provenance === "sample" && c.anchor.id.startsWith("mock:"))).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/qloo/i);
  });

  it("supports any city, with places only for the demo cities", async () => {
    const leeds = await createMockCardSource().getSwipeCards({ businessType: "cafe", city: "Leeds" });
    expect(leeds.status).toBe("ok");
    expect(leeds.cards.some((c) => c.kind === "place")).toBe(false);
    const manchester = await createMockCardSource().getSwipeCards(cafe);
    expect(manchester.cards.some((c) => c.kind === "place")).toBe(true);
  });

  it("refills 3 sample cards keyed by the liked name, excluding shown ones", async () => {
    const source = createMockCardSource();
    const deck = await source.getSwipeCards(cafe);
    const liked = deck.cards.find((c) => c.name === "Aesop")!;
    const res = RefillResponse.parse(
      await source.getRefillCards({ ...cafe, likedIds: [liked.anchor.id], excludeIds: deck.cards.map((c) => c.id) }),
    );
    expect(res.status).toBe("ok");
    expect(res.cards).toHaveLength(3);
    expect(res.cards.every((c) => c.because === "Aesop" && c.provenance === "sample")).toBe(true);
    const shown = new Set(deck.cards.map((c) => c.id));
    expect(res.cards.some((c) => shown.has(c.id))).toBe(false);
  });
});

describe("snapshot card source", () => {
  const recorded = { id: "S1", name: "Aesop", kind: "brand" as const, provenance: "snapshot" as const, anchor: { kind: "entity" as const, id: "S1", type: "urn:entity:brand" } };

  it("returns unsupported_city for pairs it has no recording for", async () => {
    setCardsSnapshotForTests({ recordedAt: "t", decks: {}, refills: {} });
    const res = await createSnapshotCardSource().getSwipeCards({ businessType: "bar", city: "Leeds" });
    expect(res.status).toBe("unsupported_city");
    expect(res.cards).toEqual([]);
  });

  it("serves the recorded deck and a refill keyed by a liked id", async () => {
    const mock = await createMockCardSource().getSwipeCards(cafe);
    const deck = [recorded, ...mock.cards.filter((c) => c.name !== "Aesop").map((c) => ({ ...c, provenance: "snapshot" as const }))];
    const refill = [1, 2, 3].map((i) => ({ ...recorded, id: `R${i}`, name: `Refill ${i}`, anchor: { ...recorded.anchor, id: `R${i}` } }));
    setCardsSnapshotForTests({ recordedAt: "t", decks: { "cafe|manchester": deck }, refills: { S1: refill } });
    const source = createSnapshotCardSource();
    const res = await source.getSwipeCards(cafe);
    expect(res.status).toBe("ok");
    expect(res.cards.every((c) => c.provenance === "snapshot")).toBe(true);
    const more = await source.getRefillCards({ ...cafe, likedIds: ["S1"], excludeIds: [] });
    expect(more.status).toBe("ok");
    expect(more.cards[0]!.because).toBe("Aesop");
    expect((await source.getRefillCards({ ...cafe, likedIds: ["nope"], excludeIds: [] })).status).toBe("unavailable");
  });
});

describe("qloo card source", () => {
  it("builds the initial deck from seeds with no live calls, cached", async () => {
    setCardDataForTests({ seedIds: fakeSeedIds() });
    const deps = fakeDeps();
    const source = createQlooCardSource(deps);
    const res = CardsResponse.parse(await source.getSwipeCards(cafe));
    expect(res.status).toBe("ok");
    expect(res.cards.every((c) => c.provenance === "qloo_seed")).toBe(true);
    await source.getSwipeCards(cafe);
    expect(deps.insights.mock.calls.length).toBeLessThanOrEqual(CARD_CALL_BUDGET.initial);
  });

  it("is unavailable when too few seeds resolved", async () => {
    setCardDataForTests({ seedIds: { generatedAt: null, entries: {} } });
    const res = await createQlooCardSource(fakeDeps()).getSwipeCards(cafe);
    expect(res.status).toBe("unavailable");
  });

  it("refills with at most 2 live calls, once per set of Yeses", async () => {
    setCardDataForTests({ seedIds: fakeSeedIds() });
    const deps = fakeDeps();
    const source = createQlooCardSource(deps);
    const req = { ...cafe, likedIds: ["ID-AESOP", "ID-OATLY", "ID-JOYDIVISION"], excludeIds: ["R-brand-0"] };
    const res = RefillResponse.parse(await source.getRefillCards(req));
    expect(res.status).toBe("ok");
    expect(deps.insights).toHaveBeenCalledTimes(CARD_CALL_BUDGET.refill);
    expect(res.cards.length).toBeLessThanOrEqual(6);
    expect(res.cards.some((c) => c.id === "R-brand-0")).toBe(false);
    expect(res.cards.every((c) => c.provenance === "qloo_refill" && c.because === "Aesop")).toBe(true);
    const params = deps.insights.mock.calls[0]![0];
    expect(params["signal.interests.entities"]).toEqual(["ID-AESOP", "ID-OATLY", "ID-JOYDIVISION"]);
    // Same Yeses in a different order: served from cache, no new calls.
    await source.getRefillCards({ ...req, likedIds: [...req.likedIds].reverse() });
    expect(deps.insights).toHaveBeenCalledTimes(CARD_CALL_BUDGET.refill);
  });

  it("makes no live calls when the quota floor is hit or the breaker is open", async () => {
    setCardDataForTests({ seedIds: fakeSeedIds() });
    for (const over of [{ quotaLow: () => true }, { circuitOpen: () => true }]) {
      const deps = fakeDeps(over);
      const source = createQlooCardSource(deps);
      expect((await source.getSwipeCards(cafe)).status).toBe("ok");
      expect((await source.getRefillCards({ ...cafe, likedIds: ["ID-AESOP"], excludeIds: [] })).status).toBe("unavailable");
      expect(deps.insights).not.toHaveBeenCalled();
    }
  });

  it("returns unavailable when Qloo fails", async () => {
    setCardDataForTests({ seedIds: fakeSeedIds() });
    const deps = fakeDeps({}, vi.fn(async () => Promise.reject(new Error("boom"))));
    const res = await createQlooCardSource(deps).getRefillCards({ ...cafe, likedIds: ["ID-AESOP"], excludeIds: [] });
    expect(res).toEqual({ status: "unavailable", cards: [] });
  });
});

describe("committed seed data", () => {
  it("every seed id entry is a public id with a known kind", async () => {
    setCardDataForTests({ seedIds: null });
    const { loadSeedIds } = await import("./cardData.js");
    const { entries } = loadSeedIds();
    for (const entry of Object.values(entries)) {
      expect(["brand", "artist", "place", "topic"]).toContain(entry.kind);
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.kind === "topic" ? entry.id.startsWith("urn:tag:") : !entry.id.startsWith("urn:tag:")).toBe(true);
    }
  });
});

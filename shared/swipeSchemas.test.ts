import { describe, expect, it } from "vitest";
import { AnchorResolutionSchema, CardsRequest, CardsResponse, RefillRequest, RefillResponse, SwipeCard } from "./schemas.js";

const card = {
  id: "abc",
  name: "Aesop",
  kind: "brand",
  provenance: "qloo_seed",
  anchor: { kind: "entity", id: "32F867B9-E6DF-44C3-BCE4-40160C7ED5E4", type: "urn:entity:brand" },
};

describe("swipe card schemas", () => {
  it("accepts a valid card and rejects bad kinds, provenance and long names", () => {
    expect(SwipeCard.safeParse(card).success).toBe(true);
    expect(SwipeCard.safeParse({ ...card, kind: "film" }).success).toBe(false);
    expect(SwipeCard.safeParse({ ...card, provenance: "guess" }).success).toBe(false);
    expect(SwipeCard.safeParse({ ...card, name: "x".repeat(49) }).success).toBe(false);
    expect(SwipeCard.safeParse({ ...card, anchor: { ...card.anchor, id: "" } }).success).toBe(false);
  });

  it("validates cards requests", () => {
    expect(CardsRequest.safeParse({ businessType: "cafe", city: " London " }).data?.city).toBe("London");
    expect(CardsRequest.safeParse({ businessType: "spaceport", city: "London" }).success).toBe(false);
    expect(CardsRequest.safeParse({ businessType: "cafe", city: "L" }).success).toBe(false);
  });

  it("validates cards responses", () => {
    expect(CardsResponse.safeParse({ status: "ok", cards: [card] }).success).toBe(true);
    expect(CardsResponse.safeParse({ status: "unsupported_city", cards: [], note: "No swipe cards for Leeds yet." }).success).toBe(true);
    expect(CardsResponse.safeParse({ status: "ok", cards: Array(21).fill(card) }).success).toBe(false);
    expect(CardsResponse.safeParse({ status: "maybe", cards: [] }).success).toBe(false);
  });

  it("validates refill requests and responses", () => {
    const ok = { businessType: "cafe", city: "London", likedIds: ["a"], excludeIds: [] };
    expect(RefillRequest.safeParse(ok).success).toBe(true);
    expect(RefillRequest.safeParse({ ...ok, likedIds: [] }).success).toBe(false);
    expect(RefillRequest.safeParse({ ...ok, likedIds: Array(7).fill("a") }).success).toBe(false);
    expect(RefillRequest.safeParse({ ...ok, excludeIds: Array(41).fill("a") }).success).toBe(false);
    expect(RefillResponse.safeParse({ status: "ok", cards: [{ ...card, because: "Aesop" }] }).success).toBe(true);
    expect(RefillResponse.safeParse({ status: "ok", cards: Array(7).fill(card) }).success).toBe(false);
  });

  it("keeps TasteAnchor.via optional", () => {
    const base = { input: "Aesop", status: "entity", entityCandidates: [], topicCandidates: [] };
    const anchor = { name: "Aesop", kind: "entity", id: "x", type: "urn:entity:brand", origin: "user" };
    expect(AnchorResolutionSchema.safeParse({ ...base, selected: anchor }).success).toBe(true);
    expect(AnchorResolutionSchema.safeParse({ ...base, selected: { ...anchor, via: "swipe" } }).success).toBe(true);
    expect(AnchorResolutionSchema.safeParse({ ...base, selected: { ...anchor, via: "telepathy" } }).success).toBe(false);
  });
});

import type { CardKind, SwipeCard } from "@shared/schemas";
import { describe, expect, it } from "vitest";
import { buildDeck, buildRefill, cardIdFor, DECK_MIN, DECK_TARGET, filterCards, isBlocked, orderDeck } from "./deck.js";

let n = 0;
function card(kind: CardKind, name = `${kind} ${++n}`): SwipeCard {
  const id = `id-${name.toLowerCase().replace(/\s+/g, "-")}`;
  return { id, name, kind, provenance: "qloo_seed", anchor: { kind: kind === "topic" ? "tag" : "entity", id, type: kind } };
}
const many = (kind: CardKind, count: number) => Array.from({ length: count }, () => card(kind));
const base = { businessType: "cafe" as const, blocklist: ["casino", "strip club"] };

function expectWellOrdered(deck: SwipeCard[]) {
  for (let i = 1; i < deck.length; i += 1) expect(deck[i]!.kind).not.toBe(deck[i - 1]!.kind);
  expect(new Set(deck.slice(0, 3).map((c) => c.kind)).size).toBe(Math.min(3, deck.length));
}

describe("buildDeck", () => {
  it("builds 14 cards in the 5/4/3/2 mix", () => {
    const deck = buildDeck({ ...base, primary: [...many("brand", 8), ...many("artist", 6), ...many("place", 3), ...many("topic", 4)] })!;
    expect(deck).toHaveLength(DECK_TARGET);
    const count = (k: CardKind) => deck.filter((c) => c.kind === k).length;
    expect([count("brand"), count("artist"), count("place"), count("topic")]).toEqual([5, 4, 3, 2]);
    expectWellOrdered(deck);
  });

  it("never puts two cards of the same kind next to each other, and opens with three kinds", () => {
    for (let trial = 0; trial < 20; trial += 1) {
      const primary = [...many("brand", 2 + (trial % 7)), ...many("artist", 1 + (trial % 5)), ...many("topic", 1 + (trial % 3))];
      const deck = buildDeck({ ...base, primary });
      if (deck) expectWellOrdered(deck);
    }
  });

  it("uses extra brands and topics when there are no places, never a fabricated place", () => {
    const deck = buildDeck({ ...base, primary: [...many("brand", 8), ...many("artist", 6), ...many("topic", 4)] })!;
    expect(deck.some((c) => c.kind === "place")).toBe(false);
    expect(deck.length).toBeGreaterThanOrEqual(12);
    expectWellOrdered(deck);
  });

  it("tops up from seeds per kind", () => {
    const seeds = [...many("brand", 5), ...many("artist", 4), ...many("topic", 2)];
    const deck = buildDeck({ ...base, primary: many("place", 3), topUp: seeds })!;
    expect(deck).toHaveLength(DECK_TARGET);
  });

  it("returns null below the minimum of 8", () => {
    expect(buildDeck({ ...base, primary: [...many("brand", 3), ...many("artist", 2), ...many("topic", 2)] })).toBeNull();
    const eight = buildDeck({ ...base, primary: [...many("brand", 3), ...many("artist", 3), ...many("topic", 2)] });
    expect(eight?.length).toBe(DECK_MIN);
  });

  it("drops duplicates, blocklisted names, long names and the business type itself", () => {
    const primary = [
      card("brand", "Aesop"),
      card("brand", "aesop"),
      card("brand", "Lucky Casino"),
      card("place", "The Strip Club"),
      card("brand", "x".repeat(49)),
      card("topic", "Café"),
      card("topic", "Cafés"),
      ...many("brand", 6),
      ...many("artist", 4),
      ...many("topic", 2),
    ];
    const deck = buildDeck({ ...base, primary })!;
    const names = deck.map((c) => c.name.toLowerCase());
    expect(names.filter((name) => name === "aesop")).toHaveLength(1);
    expect(names.some((name) => name.includes("casino") || name.includes("strip"))).toBe(false);
    expect(names.some((name) => name.length > 48)).toBe(false);
    expect(names).not.toContain("café");
    expect(names).not.toContain("cafés");
  });

  it("never includes excluded card or anchor ids", () => {
    const brands = many("brand", 8);
    const deck = buildDeck({ ...base, primary: [...brands, ...many("artist", 6), ...many("topic", 4)], exclude: [brands[0]!.id] })!;
    expect(deck.some((c) => c.id === brands[0]!.id)).toBe(false);
  });
});

describe("deck helpers", () => {
  it("matches blocklist terms as whole words only", () => {
    expect(isBlocked("Casino Royale", ["casino"])).toBe(true);
    expect(isBlocked("Casinoland", ["casino"])).toBe(false);
    expect(isBlocked("Essex", ["sex"])).toBe(false);
  });

  it("trims names and keeps the first of a duplicate anchor id", () => {
    const a = card("brand", "  Oatly  ");
    const out = filterCards([a, { ...card("brand", "Other"), anchor: a.anchor }], base);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Oatly");
  });

  it("drops cards it cannot place without breaking the order rules", () => {
    expect(orderDeck(many("brand", 4)).length).toBe(1);
  });

  it("refill excludes shown ids, caps at 6 and sets because", () => {
    const pool = [...many("brand", 5), ...many("artist", 5)];
    const out = buildRefill(pool, { ...base, exclude: [pool[0]!.id], because: "Aesop" });
    expect(out.length).toBe(6);
    expect(out.some((c) => c.id === pool[0]!.id)).toBe(false);
    expect(out.every((c) => c.because === "Aesop")).toBe(true);
  });

  it("keeps card ids within 80 characters and stable", () => {
    const long = `urn:tag:${"a".repeat(100)}`;
    expect(cardIdFor(long).length).toBeLessThanOrEqual(80);
    expect(cardIdFor(long)).toBe(cardIdFor(long));
    expect(cardIdFor("short")).toBe("short");
  });
});

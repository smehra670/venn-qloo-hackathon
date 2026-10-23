import type { CardKind, CardProvenance, SwipeCard } from "@shared/schemas";
import { shortAnchorType } from "@shared/anchorType";
import type { BusinessType } from "@shared/types";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cardIdFor } from "./deck.js";
import { PLACES, SEEDS, placeCityFor } from "./seeds.js";

/**
 * Loads the swipe-card data files that sit next to this module in dev
 * (`server/anchors/*`) and next to the bundle in production (`dist/server/*`, copied by
 * tsup's onSuccess step): `blocklist.txt`, `seed-ids.json`, `cards-snapshot.json`.
 */
function readAsset(name: string): string | null {
  const candidates = [path.join(import.meta.dirname, name), path.resolve("server/anchors", name)];
  for (const file of candidates) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      // try the next location
    }
  }
  return null;
}

let blocklist: string[] | null = null;
export function loadBlocklist(): string[] {
  if (blocklist) return blocklist;
  blocklist = (readAsset("blocklist.txt") ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return blocklist;
}

/** One seed resolved on Qloo by `npm run cards:seed`. */
export interface SeedEntry {
  name: string;
  kind: CardKind;
  /** Qloo entity id, or tag id for topics. */
  id: string;
  /** e.g. urn:entity:brand, or "tag". */
  type: string;
}

export interface SeedIdsFile {
  generatedAt: string | null;
  /** Keyed by `seedKey()`. */
  entries: Record<string, SeedEntry>;
}

export const seedKey = (kind: CardKind, name: string, city?: string): string =>
  kind === "place" ? `place:${(city ?? "").toLowerCase()}:${name.toLowerCase()}` : `${kind}:${name.toLowerCase()}`;

let seedIds: SeedIdsFile | null = null;
export function loadSeedIds(): SeedIdsFile {
  if (seedIds) return seedIds;
  try {
    const parsed = JSON.parse(readAsset("seed-ids.json") ?? "null") as SeedIdsFile | null;
    seedIds = parsed && typeof parsed.entries === "object" ? parsed : { generatedAt: null, entries: {} };
  } catch {
    seedIds = { generatedAt: null, entries: {} };
  }
  return seedIds;
}

/** Test hook: replace (or with `null`, reload) the seed ids and blocklist. */
export function setCardDataForTests(data: { seedIds?: SeedIdsFile | null; blocklist?: string[] | null }): void {
  if ("seedIds" in data) seedIds = data.seedIds ?? null;
  if ("blocklist" in data) blocklist = data.blocklist ?? null;
}

export interface SeedName {
  name: string;
  kind: CardKind;
  /** Demo city, for places. */
  city?: string;
}

/** The seed names for a business type and city, in deck-priority order. Places only for the
 * demo cities in `PLACES`. */
export function seedNamesFor(businessType: BusinessType, city: string): SeedName[] {
  const list = SEEDS[businessType];
  const placeCity = placeCityFor(city);
  return [
    ...list.brands.map((name) => ({ name, kind: "brand" as const })),
    ...list.artists.map((name) => ({ name, kind: "artist" as const })),
    ...(placeCity ? (PLACES[placeCity] ?? []).map((name) => ({ name, kind: "place" as const, city: placeCity })) : []),
    ...list.topics.map((name) => ({ name, kind: "topic" as const })),
  ];
}

export function cardFromSeed(entry: SeedEntry, provenance: CardProvenance): SwipeCard {
  return {
    id: cardIdFor(entry.id),
    name: entry.name,
    kind: entry.kind,
    provenance,
    // Same short type as a typed anchor ("brand", "topic"…), so both send the same request.
    anchor: { kind: entry.kind === "topic" ? "tag" : "entity", id: entry.id, type: shortAnchorType(entry.type) },
  };
}

/** Seed cards with real Qloo ids for a business type and city. Seeds that did not resolve
 * cleanly are absent from `seed-ids.json` and therefore skipped. */
export function seedCardsFor(businessType: BusinessType, city: string, provenance: CardProvenance): SwipeCard[] {
  const { entries } = loadSeedIds();
  return seedNamesFor(businessType, city)
    .map((seed) => entries[seedKey(seed.kind, seed.name, seed.city)])
    .filter((entry): entry is SeedEntry => Boolean(entry))
    .map((entry) => cardFromSeed(entry, provenance));
}

/** Name of a seed by its Qloo id (used for "Because you said yes to …"). */
export function seedNameById(id: string): string | undefined {
  return Object.values(loadSeedIds().entries).find((entry) => entry.id === id)?.name;
}

/** Recorded decks and refills for the snapshot provider, written by `npm run cards:seed`. */
export interface CardsSnapshotFile {
  recordedAt: string | null;
  /** Keyed by `${businessType}|${city lower case}`. */
  decks: Record<string, SwipeCard[]>;
  /** Keyed by the liked anchor id the refill was recorded for. */
  refills: Record<string, SwipeCard[]>;
}

let cardsSnapshot: CardsSnapshotFile | null = null;
export function loadCardsSnapshot(): CardsSnapshotFile {
  if (cardsSnapshot) return cardsSnapshot;
  try {
    const parsed = JSON.parse(readAsset("cards-snapshot.json") ?? "null") as CardsSnapshotFile | null;
    cardsSnapshot = parsed && typeof parsed.decks === "object" ? normaliseSnapshot(parsed) : { recordedAt: null, decks: {}, refills: {} };
  } catch {
    cardsSnapshot = { recordedAt: null, decks: {}, refills: {} };
  }
  return cardsSnapshot;
}

/** Older recordings stored Qloo's long anchor types; serve the short form typed anchors use. */
function normaliseSnapshot(file: CardsSnapshotFile): CardsSnapshotFile {
  const fix = (cards: SwipeCard[]) => cards.map((card) => ({ ...card, anchor: { ...card.anchor, type: shortAnchorType(card.anchor.type) } }));
  return {
    ...file,
    decks: Object.fromEntries(Object.entries(file.decks).map(([key, cards]) => [key, fix(cards)])),
    refills: Object.fromEntries(Object.entries(file.refills).map(([key, cards]) => [key, fix(cards)])),
  };
}

export function setCardsSnapshotForTests(data: CardsSnapshotFile | null): void {
  cardsSnapshot = data;
}

export const snapshotDeckKey = (businessType: BusinessType, city: string): string =>
  `${businessType}|${city.split(",")[0]?.trim().toLowerCase() ?? ""}`;

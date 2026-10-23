import type { CardKind, CardsRequest, CardsResponse, RefillRequest, RefillResponse, SwipeCard } from "@shared/schemas";
import { shortAnchorType } from "@shared/anchorType";
import type { BusinessType } from "@shared/types";
import { TtlCache } from "../utils/ttlCache.js";
import type { QueryValue } from "../providers/qloo/client.js";
import type { QlooEntity } from "../providers/qloo/schemas.js";
import {
  loadBlocklist,
  loadCardsSnapshot,
  seedCardsFor,
  seedNameById,
  seedNamesFor,
  snapshotDeckKey,
} from "./cardData.js";
import { buildDeck, buildRefill, cardIdFor } from "./deck.js";
import { SEEDS } from "./seeds.js";

/**
 * Swipe-card sources, one per provider. Every source runs its cards through `buildDeck()` /
 * `buildRefill()` so the deck rules are identical everywhere. Strategy choice comes from the
 * Step 0 probe (docs/CARDS_PROBE.md): the initial deck is seeds with exact Qloo ids (no live
 * calls), the refill is live `GET /v2/insights` signalled by the person's Yeses.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const NEGATIVE_TTL_MS = 10 * 60 * 1000;
/** Live calls allowed per swipe session. The initial deck currently uses none (Strategy S). */
export const CARD_CALL_BUDGET = { initial: 4, refill: 2 } as const;

const UNAVAILABLE_NOTE = "Swipe cards are not available right now.";

export interface CardSource {
  getSwipeCards(req: CardsRequest, signal?: AbortSignal): Promise<CardsResponse>;
  getRefillCards(req: RefillRequest, signal?: AbortSignal): Promise<RefillResponse>;
}

const deckCacheKey = (req: CardsRequest): string => `${req.businessType}|${req.city.trim().toLowerCase()}`;
const refillCacheKey = (req: RefillRequest): string => [...req.likedIds].sort().join(",");

// ---------------------------------------------------------------- live Qloo

export interface QlooCardDeps {
  insights(params: Record<string, QueryValue>, signal?: AbortSignal): Promise<{ entities: QlooEntity[] }>;
  quotaLow(): boolean;
  circuitOpen(): boolean;
}

const REFILL_KINDS: Array<{ kind: CardKind; type: string }> = [
  { kind: "brand", type: "urn:entity:brand" },
  { kind: "artist", type: "urn:entity:artist" },
];

function cardFromEntity(entity: QlooEntity, kind: CardKind, type: string): SwipeCard | null {
  const id = entity.entity_id ?? entity.id;
  const name = entity.name?.trim();
  if (!id || !name || id.length > 120) return null;
  return { id: cardIdFor(id), name: name.slice(0, 200), kind, provenance: "qloo_refill", anchor: { kind: "entity", id, type: shortAnchorType(type) } };
}

export function createQlooCardSource(deps: QlooCardDeps): CardSource {
  const decks = new TtlCache<CardsResponse>();
  /** Unfiltered refill candidates per sorted likedIds; `excludeIds` is applied per request. */
  const refills = new TtlCache<SwipeCard[] | null>();

  return {
    async getSwipeCards(req) {
      const key = deckCacheKey(req);
      const hit = decks.get(key);
      if (hit) return hit;
      const deck = buildDeck({
        businessType: req.businessType,
        primary: seedCardsFor(req.businessType, req.city, "qloo_seed"),
        blocklist: loadBlocklist(),
      });
      const response: CardsResponse = deck
        ? { status: "ok", cards: deck }
        : { status: "unavailable", cards: [], note: UNAVAILABLE_NOTE };
      decks.set(key, response, deck ? DAY_MS : NEGATIVE_TTL_MS);
      return response;
    },

    async getRefillCards(req, signal) {
      const key = refillCacheKey(req);
      let candidates = refills.get(key);
      if (candidates === undefined) {
        if (deps.quotaLow() || deps.circuitOpen()) return { status: "unavailable", cards: [] };
        const entityIds = req.likedIds.filter((id) => !id.startsWith("urn:tag:"));
        const tagIds = req.likedIds.filter((id) => id.startsWith("urn:tag:"));
        const calls = REFILL_KINDS.slice(0, CARD_CALL_BUDGET.refill).map(async ({ kind, type }) => {
          const params: Record<string, QueryValue> = { "filter.type": type, take: 8 };
          if (entityIds.length) params["signal.interests.entities"] = entityIds;
          if (tagIds.length) params["signal.interests.tags"] = tagIds;
          const { entities } = await deps.insights(params, signal);
          return entities.map((entity) => cardFromEntity(entity, kind, type)).filter((c): c is SwipeCard => c !== null);
        });
        const settled = await Promise.allSettled(calls);
        const lists = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
        // Interleave brand/artist so the first three refill cards are mixed.
        candidates = lists.length ? interleave(lists) : null;
        refills.set(key, candidates, candidates?.length ? DAY_MS : NEGATIVE_TTL_MS);
      }
      if (!candidates?.length) return { status: "unavailable", cards: [] };
      const cards = buildRefill(candidates, {
        businessType: req.businessType,
        blocklist: loadBlocklist(),
        exclude: [...req.excludeIds, ...req.likedIds],
        because: becauseName(req.likedIds),
      });
      return cards.length ? { status: "ok", cards } : { status: "unavailable", cards: [] };
    },
  };
}

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i += 1) for (const list of lists) if (list[i] !== undefined) out.push(list[i]!);
  return out;
}

function becauseName(likedIds: readonly string[]): string | undefined {
  for (const id of likedIds) {
    const name = seedNameById(id);
    if (name) return name;
  }
  return undefined;
}

// ---------------------------------------------------------------- snapshot

export function createSnapshotCardSource(): CardSource {
  return {
    async getSwipeCards(req) {
      const recorded = loadCardsSnapshot().decks[snapshotDeckKey(req.businessType, req.city)];
      if (!recorded?.length) {
        return {
          status: "unsupported_city",
          cards: [],
          note: `No swipe cards for ${req.city.slice(0, 60)} yet.`,
        };
      }
      const deck = buildDeck({ businessType: req.businessType, primary: recorded, blocklist: loadBlocklist() });
      return deck ? { status: "ok", cards: deck } : { status: "unavailable", cards: [], note: UNAVAILABLE_NOTE };
    },

    async getRefillCards(req) {
      const { refills, decks } = loadCardsSnapshot();
      const likedId = req.likedIds.find((id) => refills[id]?.length);
      if (!likedId) return { status: "unavailable", cards: [] };
      const because = Object.values(decks)
        .flat()
        .find((card) => card.anchor.id === likedId)?.name;
      const cards = buildRefill(refills[likedId]!, {
        businessType: req.businessType,
        blocklist: loadBlocklist(),
        exclude: [...req.excludeIds, ...req.likedIds],
        because,
      });
      return cards.length ? { status: "ok", cards } : { status: "unavailable", cards: [] };
    },
  };
}

// ---------------------------------------------------------------- mock

const slug = (name: string): string =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Short anchor types, the same as the typed resolver uses.
const MOCK_TYPES: Record<CardKind, string> = { brand: "brand", artist: "artist", place: "place", topic: "topic" };

function mockCard(name: string, kind: CardKind): SwipeCard {
  const id = `mock:${slug(name)}`;
  return { id, name, kind, provenance: "sample", anchor: { kind: kind === "topic" ? "tag" : "entity", id, type: MOCK_TYPES[kind] } };
}

function hashOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Every mock card across all business types (deduped), for refills and name lookups. */
function allMockCards(): SwipeCard[] {
  const seen = new Map<string, SwipeCard>();
  for (const type of Object.keys(SEEDS) as BusinessType[]) {
    for (const seed of seedNamesFor(type, "")) if (!seen.has(slug(seed.name))) seen.set(slug(seed.name), mockCard(seed.name, seed.kind));
  }
  return [...seen.values()];
}

/** Offline decks from the seed lists, with synthetic `mock:<slug>` ids and `sample` provenance.
 * Every city works; places only appear for the demo cities (never invented). */
export function createMockCardSource(): CardSource {
  return {
    async getSwipeCards(req) {
      const primary = seedNamesFor(req.businessType, req.city).map((seed) => mockCard(seed.name, seed.kind));
      const deck = buildDeck({ businessType: req.businessType, primary, blocklist: loadBlocklist() });
      return deck ? { status: "ok", cards: deck } : { status: "unavailable", cards: [], note: UNAVAILABLE_NOTE };
    },

    async getRefillCards(req) {
      const pool = allMockCards();
      const likedName = pool.find((card) => card.anchor.id === req.likedIds[0])?.name ?? req.likedIds[0]!;
      // Deterministic rotation of the whole pool, keyed by the liked name.
      const start = hashOf(likedName) % pool.length;
      const rotated = [...pool.slice(start), ...pool.slice(0, start)];
      const cards = buildRefill(rotated, {
        businessType: req.businessType,
        blocklist: loadBlocklist(),
        exclude: [...req.excludeIds, ...req.likedIds],
        because: pool.some((card) => card.anchor.id === req.likedIds[0]) ? likedName : undefined,
      }).slice(0, 3);
      return cards.length ? { status: "ok", cards } : { status: "unavailable", cards: [] };
    },
  };
}

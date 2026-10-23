import type { CardKind, SwipeCard } from "@shared/schemas";
import type { BusinessType } from "@shared/types";
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPE_PLURALS } from "@shared/constants";

/**
 * Deck rules shared by every provider (see docs/ANCHORS.md, "Swipe cards"): one place that
 * filters, mixes and orders cards, so mock, snapshot and live Qloo decks behave the same.
 */

export const DECK_TARGET = 14;
export const DECK_MIN = 8;
export const REFILL_MAX = 6;
export const MAX_NAME = 48;

/** Kind mix for a full deck. Missing places are replaced by extra brands and topics. */
export const KIND_MIX: Record<CardKind, number> = { brand: 5, artist: 4, place: 3, topic: 2 };
const KIND_ORDER: CardKind[] = ["brand", "artist", "place", "topic"];
const FILL_ORDER: CardKind[] = ["brand", "topic", "artist"];

const norm = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

/** True when a blocklist term appears in `name` as a whole word (or whole phrase). */
export function isBlocked(name: string, blocklist: readonly string[]): boolean {
  const text = ` ${norm(name).replace(/[^a-z0-9&']+/g, " ")} `;
  return blocklist.some((term) => {
    const t = norm(term).replace(/[^a-z0-9&']+/g, " ").trim();
    return t.length > 0 && text.includes(` ${t} `);
  });
}

function isBusinessTypeName(name: string, businessType: BusinessType): boolean {
  const n = norm(name);
  return (
    n === norm(BUSINESS_TYPE_LABELS[businessType]) ||
    n === norm(BUSINESS_TYPE_PLURALS[businessType]) ||
    n === businessType.replace(/_/g, " ")
  );
}

/**
 * Trims names and drops: empty or over-48-character names, case-insensitive duplicate names,
 * duplicate anchor ids, blocklisted names, names equal to the business type, and anything in
 * `exclude` (card ids or anchor ids). Order is kept.
 */
export function filterCards(
  cards: readonly SwipeCard[],
  opts: { businessType: BusinessType; blocklist: readonly string[]; exclude?: Iterable<string> },
): SwipeCard[] {
  const exclude = new Set(opts.exclude ?? []);
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const out: SwipeCard[] = [];
  for (const card of cards) {
    const name = card.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > MAX_NAME) continue;
    const key = norm(name);
    if (seenNames.has(key) || seenIds.has(card.anchor.id)) continue;
    if (exclude.has(card.id) || exclude.has(card.anchor.id)) continue;
    if (isBlocked(name, opts.blocklist) || isBusinessTypeName(name, opts.businessType)) continue;
    seenNames.add(key);
    seenIds.add(card.anchor.id);
    out.push(name === card.name ? card : { ...card, name });
  }
  return out;
}

/**
 * Orders cards so no two of the same kind sit next to each other and the first three are three
 * different kinds (greedy: always the kind with most cards left that is allowed here). Cards
 * that cannot be placed without breaking a rule are dropped. Within a kind, order is kept.
 */
export function orderDeck(cards: readonly SwipeCard[]): SwipeCard[] {
  const pools = new Map<CardKind, SwipeCard[]>(KIND_ORDER.map((kind) => [kind, []]));
  for (const card of cards) pools.get(card.kind)?.push(card);
  const out: SwipeCard[] = [];
  while (true) {
    const last = out[out.length - 1]?.kind;
    const opening = new Set(out.length < 3 ? out.map((card) => card.kind) : []);
    let pick: CardKind | null = null;
    for (const kind of KIND_ORDER) {
      const size = pools.get(kind)?.length ?? 0;
      if (size === 0 || kind === last || opening.has(kind)) continue;
      if (pick === null || size > (pools.get(pick)?.length ?? 0)) pick = kind;
    }
    if (pick === null) break;
    out.push(pools.get(pick)!.shift()!);
  }
  return out;
}

export interface DeckInput {
  businessType: BusinessType;
  /** Preferred cards in priority order (live or recorded Qloo, or the seeds themselves). */
  primary: readonly SwipeCard[];
  /** Seeds used to top up kinds the primary list is short of. */
  topUp?: readonly SwipeCard[];
  blocklist: readonly string[];
  /** Card ids or anchor ids never to include. */
  exclude?: Iterable<string>;
}

/**
 * Builds a deck: target 14 cards in the mix 5 brands, 4 artists, 3 places, 2 topics, topped up
 * from seeds per kind; missing places become extra brands and topics (a place is never
 * invented). Returns null when fewer than 8 cards survive, which callers turn into
 * `status: "unavailable"`.
 */
export function buildDeck(input: DeckInput): SwipeCard[] | null {
  const opts = { businessType: input.businessType, blocklist: input.blocklist, exclude: input.exclude };
  const all = filterCards([...input.primary, ...(input.topUp ?? [])], opts);
  const byKind = new Map<CardKind, SwipeCard[]>(KIND_ORDER.map((kind) => [kind, all.filter((c) => c.kind === kind)]));

  const chosen: SwipeCard[] = [];
  for (const kind of KIND_ORDER) chosen.push(...byKind.get(kind)!.splice(0, KIND_MIX[kind]));

  // Fill any shortfall (usually places) with extra brands and topics, then artists.
  let progress = true;
  while (chosen.length < DECK_TARGET && progress) {
    progress = false;
    for (const kind of FILL_ORDER) {
      if (chosen.length >= DECK_TARGET) break;
      const next = byKind.get(kind)!.shift();
      if (next) {
        chosen.push(next);
        progress = true;
      }
    }
  }

  const deck = orderDeck(chosen);
  return deck.length >= DECK_MIN ? deck : null;
}

/**
 * Refill rules: filtered like a deck, never repeats `exclude` (shown cards and the Yeses
 * themselves), interleaved by kind where possible, at most 6, each marked with `because`.
 */
export function buildRefill(
  cards: readonly SwipeCard[],
  opts: { businessType: BusinessType; blocklist: readonly string[]; exclude: Iterable<string>; because?: string },
): SwipeCard[] {
  const kept = filterCards(cards, opts);
  const ordered = orderDeck(kept);
  const placed = new Set(ordered.map((card) => card.id));
  const rest = kept.filter((card) => !placed.has(card.id));
  const because = opts.because?.slice(0, MAX_NAME);
  return [...ordered, ...rest].slice(0, REFILL_MAX).map((card) => (because ? { ...card, because } : card));
}

/** Stable, React-key-safe card id for an anchor id (kept under the 80-character limit). */
export function cardIdFor(anchorId: string): string {
  if (anchorId.length <= 80) return anchorId;
  let h = 0;
  for (let i = 0; i < anchorId.length; i += 1) h = (h * 31 + anchorId.charCodeAt(i)) >>> 0;
  return `${anchorId.slice(0, 68)}~${h.toString(36)}`;
}

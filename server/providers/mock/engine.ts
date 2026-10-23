import { anchorEntityType } from "@shared/anchorType";
import { DEMO_LIMITS, UNKNOWN_CITY_LIMIT } from "@shared/constants";
import type {
  BusinessInput,
  CityInfo,
  DiscoverSpec,
  EntityType,
  EvidenceItem,
  Heatmap,
  HeatSpot,
  Normalization,
  Partner,
  PartnerKind,
  RankEntry,
  ResolvedAnchor,
  RunResult,
  SignalBreakdown,
  TopPick,
} from "@shared/types";
import { PARTNER_KINDS } from "@shared/types";
import Fuse from "fuse.js";
import { CATALOG, type CatalogEntry } from "./catalog.js";
import { matchCity } from "./cities.js";
import { profileFor } from "./profiles.js";
import { TAXONOMY, lookupSynonyms, tagLabel } from "./taxonomy.js";
import type { Candidate } from "../types.js";
import { computeNormalization, stretchWithNormalization } from "../scoring.js";
import { hashString, unitFor } from "../../utils/rng.js";
import { clamp } from "../../utils/text.js";

const GROUPS: Record<PartnerKind, string> = {
  food: "FD",
  drink: "FD",
  music: "MC",
  venue: "MC",
  culture: "MC",
  fashion: "FR",
  retail: "FR",
  fitness: "FW",
  wellness: "FW",
};

const CROSS: Record<string, number> = {
  "FD|MC": 0.5,
  "MC|FD": 0.5,
  "FD|FR": 0.8,
  "FR|FD": 0.8,
  "FD|FW": 0.6,
  "FW|FD": 0.6,
  "MC|FR": 0.6,
  "FR|MC": 0.6,
  "MC|FW": 0.8,
  "FW|MC": 0.8,
  "FR|FW": 0.7,
  "FW|FR": 0.7,
};

const fuse = new Fuse(
  CATALOG.map((entry) => ({
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases ?? [],
  })),
  {
    keys: ["name", "aliases"],
    threshold: 0.28,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 3,
  },
);

export function seedFor(input: BusinessInput): number {
  const anchors = input.anchors.map((anchor) => anchor.toLowerCase()).sort();
  return hashString(`${input.businessType}|${input.city.trim().toLowerCase()}|${anchors.join("|")}`);
}

export function surpriseDistance(category: PartnerKind, kind: PartnerKind): number {
  if (category === kind) return 0;
  const left = GROUPS[category];
  const right = GROUPS[kind];
  if (left === right) return 0.3;
  return CROSS[`${left}|${right}`] ?? 0.7;
}

function addWeight(map: Map<string, number>, tag: string, weight: number): void {
  map.set(tag, Math.max(map.get(tag) ?? 0, weight));
}

function normalise(map: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const value of map.values()) max = Math.max(max, value);
  if (max <= 0) return map;
  for (const [key, value] of map) map.set(key, value / max);
  return map;
}

export function cosine(left: Map<string, number>, right: Map<string, number>): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const [key, value] of left) {
    leftNorm += value * value;
    const other = right.get(key);
    if (other !== undefined) dot += value * other;
  }
  for (const value of right.values()) rightNorm += value * value;
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function weightedJaccard(left: Map<string, number>, right: Map<string, number>): number {
  const keys = new Set<string>([...left.keys(), ...right.keys()]);
  let minSum = 0;
  let maxSum = 0;
  for (const key of keys) {
    const a = left.get(key) ?? 0;
    const b = right.get(key) ?? 0;
    minSum += Math.min(a, b);
    maxSum += Math.max(a, b);
  }
  return maxSum === 0 ? 0 : minSum / maxSum;
}

function recordToMap(record: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(record));
}

function listToMap(tags: string[], weight = 1): Map<string, number> {
  const map = new Map<string, number>();
  for (const tag of tags) map.set(tag, weight);
  return map;
}

export interface TasteProfiles {
  audience: Map<string, number>;
  business: Map<string, number>;
}

export function buildProfiles(input: BusinessInput, resolved: ResolvedAnchor[]): TasteProfiles {
  const audience = new Map<string, number>();
  const business = new Map<string, number>();
  const profile = profileFor(input.businessType);
  for (const tag of profile.baseTags) {
    addWeight(audience, tag, 0.5);
    addWeight(business, tag, 1);
  }
  for (const anchor of resolved) {
    anchor.tags.forEach((tag, index) => {
      const weight = anchor.status === "matched" ? (index < 2 ? 1 : 0.7) : anchor.status === "keyword" ? 0.8 : 0.4;
      addWeight(audience, tag, weight);
      addWeight(business, tag, 0.5);
    });
  }
  return { audience: normalise(audience), business: normalise(business) };
}

function guessedTags(value: string): string[] {
  const rng = mulberryFrom(hashString(value.toLowerCase()));
  const first = Math.floor(rng() * TAXONOMY.length);
  let second = Math.floor(rng() * TAXONOMY.length);
  if (second === first) second = (second + 1) % TAXONOMY.length;
  const a = TAXONOMY[first];
  const b = TAXONOMY[second];
  return [a, b].filter((tag): tag is (typeof TAXONOMY)[number] => tag !== undefined);
}

function mulberryFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function entityPhrase(entry: CatalogEntry): string {
  if (entry.entityType === "artist") return "artist";
  if (entry.entityType === "place") return "place";
  return "brand";
}

export function resolveOne(raw: string): ResolvedAnchor {
  const input = raw.trim();
  const query = input.toLowerCase();
  const exact = CATALOG.find(
    (item) => item.name.toLowerCase() === query || item.aliases?.some((alias) => alias.toLowerCase() === query),
  );
  const fuzzy = exact ? undefined : fuse.search(query, { limit: 1 })[0];
  const fuzzyScore = fuzzy?.score ?? 1;
  const fuzzyEntry = fuzzy && fuzzyScore <= 0.28 ? CATALOG.find((item) => item.id === fuzzy.item.id) : undefined;
  const keywords = lookupSynonyms(query);
  const matched = exact ?? (fuzzyEntry && (keywords.length === 0 || fuzzyScore <= 0.12) ? fuzzyEntry : undefined);
  if (matched) {
    const tags = Object.keys(matched.tags);
    return {
      input,
      status: "matched",
      entityId: matched.id,
      entityName: matched.name,
      entityType: matched.entityType,
      tags,
      note: `Matched "${input}" to the ${entityPhrase(matched)} ${matched.name}.`,
    };
  }
  if (keywords.length > 0) {
    const labels = keywords.map((tag) => tagLabel(tag));
    const noun = labels.length === 1 ? "interest" : "interests";
    return {
      input,
      status: "keyword",
      tags: keywords,
      note: `Read "${input}" as the ${noun}: ${labels.join(", ")}.`,
    };
  }
  return {
    input,
    status: "guessed",
    tags: guessedTags(query),
    note: `Couldn't place "${input}" in the demo dataset. Try a clearer brand, artist or topic — or switch to live Qloo.`,
  };
}

export function resolveAnchors(input: BusinessInput): ResolvedAnchor[] {
  if (input.tasteAnchors && input.tasteAnchors.length > 0) {
    return input.tasteAnchors.map((anchor) => {
      // Swiped sample cards carry synthetic `mock:<slug>` ids; read them by name against the
      // demo catalog, exactly as a typed anchor would be.
      if (anchor.id.startsWith("mock:")) return resolveOne(anchor.name);
      if (anchor.kind === "entity") {
        return {
          input: anchor.name,
          status: "matched" as const,
          entityId: anchor.id,
          entityName: anchor.name,
          entityType: anchorEntityType(anchor.type),
          tags: [],
          note: `Confirmed ${anchor.name} from setup.`,
        };
      }
      const synonyms = lookupSynonyms(anchor.name);
      return {
        input: anchor.name,
        status: "keyword" as const,
        tags: synonyms.length > 0 ? synonyms : [anchor.name.toLowerCase().replace(/\s+/g, "_")],
        note: `Confirmed topic ${anchor.name} from setup.`,
      };
    });
  }
  return input.anchors.map((anchor) => resolveOne(anchor));
}

export function planKinds(input: BusinessInput): PartnerKind[] {
  return profileFor(input.businessType).kinds.slice(0, 6);
}

export function widenKinds(input: BusinessInput): PartnerKind[] {
  return profileFor(input.businessType).kinds.slice(6, 8);
}

function eligible(input: BusinessInput, kind: PartnerKind): CatalogEntry[] {
  const city = matchCity(input.city);
  const category = profileFor(input.businessType).category;
  return CATALOG.filter((item) => {
    if (item.kind !== kind) return false;
    if (item.city) {
      if (!city || item.city !== city.name) return false;
      if (item.kind === category) return false;
    }
    return true;
  });
}

export function provisionalRaw(input: BusinessInput, resolved: ResolvedAnchor[], item: CatalogEntry): number {
  const profiles = buildProfiles(input, resolved);
  const tagMap = recordToMap(item.tags);
  const audienceMap = listToMap(item.audienceTags, 1);
  const toPartner = cosine(profiles.audience, tagMap);
  const fromPartner = cosine(audienceMap, profiles.business);
  const mutual = toPartner > 0 && fromPartner > 0 ? (2 * toPartner * fromPartner) / (toPartner + fromPartner) : 0;
  const overlap = Math.min(1, 1.8 * weightedJaccard(profiles.audience, tagMap));
  const trend01 = (clamp(item.trend, -0.3, 0.4) + 0.3) / 0.7;
  return 0.4 * mutual + 0.2 * overlap + 0.2 * item.popularity + 0.2 * trend01;
}

export function candidatesForKind(input: BusinessInput, resolved: ResolvedAnchor[], kind: PartnerKind): Candidate[] {
  const city = matchCity(input.city);
  return eligible(input, kind)
    .map((item) => {
      const local = Boolean(item.city);
      let provisional = provisionalRaw(input, resolved, item);
      // Prefer neighbourhood places you can walk into over global platforms / media brands.
      if (city) {
        if (local && item.entityType === "place") provisional += 0.18;
        else if (!local && item.entityType !== "place") provisional -= 0.12;
      }
      return { entry: item, local, provisional };
    })
    .sort((a, b) => b.provisional - a.provisional || a.entry.id.localeCompare(b.entry.id));
}

export function rawFromSignals(signals: SignalBreakdown): number {
  const mutual =
    signals.affinityToPartner > 0 && signals.affinityFromPartner > 0
      ? (2 * signals.affinityToPartner * signals.affinityFromPartner) /
        (signals.affinityToPartner + signals.affinityFromPartner)
      : 0;
  return 0.4 * mutual + 0.2 * signals.tagOverlap + 0.2 * signals.localPopularity + 0.2 * signals.trend;
}

function trend01(trend: number): number {
  return (clamp(trend, -0.3, 0.4) + 0.3) / 0.7;
}

function trendWord(value: number): "Rising" | "Steady" | "Cooling" {
  if (value > 0.6) return "Rising";
  if (value < 0.4) return "Cooling";
  return "Steady";
}

function stretch(raw: number, min: number, max: number): number {
  return stretchWithNormalization(raw, { minRaw: min, maxRaw: max });
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

interface ScoredDraft {
  entry: CatalogEntry;
  local: boolean;
  signals: SignalBreakdown;
  raw: number;
  sharedTagIds: string[];
}

export function draftPartner(input: BusinessInput, resolved: ResolvedAnchor[], item: CatalogEntry, seed: number): ScoredDraft {
  const profiles = buildProfiles(input, resolved);
  const tagMap = recordToMap(item.tags);
  const audienceMap = listToMap(item.audienceTags, 1);
  const affinityToPartner = cosine(profiles.audience, tagMap);
  const affinityFromPartner = cosine(audienceMap, profiles.business);
  const tagOverlap = Math.min(1, 1.8 * weightedJaccard(profiles.audience, tagMap));
  const roll = unitFor(seed, item.id);
  const localPopularity = item.city
    ? clamp(item.popularity + (roll - 0.5) * 0.2, 0.3, 1)
    : clamp(item.popularity * (0.85 + roll * 0.2), 0.3, 1);
  const trend = trend01(item.trend);
  const mutual =
    affinityToPartner > 0 && affinityFromPartner > 0
      ? (2 * affinityToPartner * affinityFromPartner) / (affinityToPartner + affinityFromPartner)
      : 0;
  const sharedTagIds = Object.keys(item.tags).filter((tag) => (profiles.audience.get(tag) ?? 0) >= 0.35);
  return {
    entry: item,
    local: Boolean(item.city),
    raw: 0.4 * mutual + 0.2 * tagOverlap + 0.2 * localPopularity + 0.2 * trend,
    sharedTagIds,
    signals: { affinityToPartner, affinityFromPartner, tagOverlap, localPopularity, trend },
  };
}

function evidenceFor(input: BusinessInput, draft: ScoredDraft, surprise: number): EvidenceItem[] {
  const city = matchCity(input.city)?.name ?? input.city.trim();
  const shared = draft.sharedTagIds.map((tag) => tagLabel(tag));
  const pop = draft.signals.localPopularity;
  const popularity = draft.local
    ? pop > 0.75
      ? `High in ${city}`
      : pop > 0.55
        ? `Solid in ${city}`
        : `Modest in ${city}`
    : pop > 0.75
      ? "High, widely known"
      : "Known, with a narrower reach";
  const distance =
    surprise === 0
      ? "Same kind of business"
      : surprise <= 0.3
        ? "A neighbouring industry"
        : surprise < 0.6
          ? "A step away from your industry"
          : "A different industry, so the overlap is less obvious";
  return [
    { label: "Shared tags", value: shared.length > 0 ? shared.join(", ") : "No strong shared tags", origin: "data" },
    { label: "Taste fit you -> them", value: `${Math.round(draft.signals.affinityToPartner * 100)}%`, origin: "data" },
    { label: "Taste fit them -> you", value: `${Math.round(draft.signals.affinityFromPartner * 100)}%`, origin: "data" },
    { label: "Local popularity", value: popularity, origin: "data" },
    { label: "Trend", value: trendWord(draft.signals.trend), origin: "data" },
    { label: "Industry distance", value: distance, origin: "interpretation" },
    {
      label: "How Venn ranked it",
      value: "Mutual fit 40% + shared tags 20% + local popularity 20% + trend 20%, scaled relative to this search.",
      origin: "interpretation",
    },
  ];
}

function reasonsFor(draft: ScoredDraft, surprise: number, isSurprising: boolean, cityName: string): string[] {
  const reasons: string[] = [];
  const labels = draft.sharedTagIds.map((tag) => tagLabel(tag));
  const first = labels[0];
  const second = labels[1];
  if (first && second) {
    reasons.push(`Your customers and ${draft.entry.name}'s audience both lean ${first} and ${second}.`);
  }
  if (draft.signals.trend > 0.6) reasons.push(`${draft.entry.name} is trending up right now.`);
  if (draft.local && draft.signals.localPopularity > 0.7) {
    const where = draft.entry.neighbourhood ?? cityName;
    reasons.push(`Well loved nearby: popular around ${where}.`);
  }
  if (isSurprising) {
    reasons.push("A different industry, so you'd reach new people rather than your own regulars.");
  }
  if (draft.signals.affinityFromPartner > 0.6) {
    reasons.push("Their audience already leans towards what you offer.");
  }
  return reasons.slice(0, 3);
}

export function toPartner(
  input: BusinessInput,
  draft: ScoredDraft,
  matchScore: number,
  surprise: number,
  isSurprising: boolean,
): Partner {
  const cityName = matchCity(input.city)?.name ?? input.city.trim();
  const partner: Partner = {
    id: draft.entry.id,
    name: draft.entry.name,
    kind: draft.entry.kind,
    entityType: draft.entry.entityType,
    blurb: draft.entry.blurb,
    local: draft.local,
    matchScore,
    surprise,
    isSurprising,
    reasons: reasonsFor(draft, surprise, isSurprising, cityName),
    sharedTags: draft.sharedTagIds.map((tag) => tagLabel(tag)),
    tags: Object.keys(draft.entry.tags),
    signals: draft.signals,
    evidence: evidenceFor(input, draft, surprise),
    relatedIds: [],
  };
  if (draft.entry.neighbourhood) partner.locationLabel = `${draft.entry.neighbourhood}, ${cityName}`;
  return partner;
}

export function scoreCandidates(
  input: BusinessInput,
  resolved: ResolvedAnchor[],
  candidates: Candidate[],
  out?: { normalization?: Normalization },
): Partner[] {
  const seed = seedFor(input);
  const category = profileFor(input.businessType).category;
  const drafts = candidates.map((candidate) => draftPartner(input, resolved, candidate.entry, seed));
  const raws = drafts.map((draft) => draft.raw);
  const normalization = computeNormalization(raws);
  if (out) out.normalization = normalization;
  const preliminary = drafts.map((draft) => ({
    draft,
    matchScore: stretchWithNormalization(draft.raw, normalization),
    surprise: surpriseDistance(category, draft.entry.kind),
  }));
  const mid = median(preliminary.map((item) => item.matchScore));
  const partners = preliminary
    .map((item) => toPartner(input, item.draft, item.matchScore, item.surprise, item.surprise >= 0.6 && item.matchScore >= mid))
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
  attachRelated(partners);
  return partners;
}

const ENTITY_TYPE_FOR_KIND: Record<PartnerKind, EntityType> = {
  music: "artist",
  retail: "brand",
  fashion: "brand",
  wellness: "brand",
  food: "place",
  drink: "place",
  venue: "place",
  fitness: "place",
  culture: "place",
};

export function entityTypeForKind(kind: PartnerKind): EntityType {
  return ENTITY_TYPE_FOR_KIND[kind];
}

function hintedKind(entityHint?: string): PartnerKind {
  if (entityHint && (PARTNER_KINDS as readonly string[]).includes(entityHint)) return entityHint as PartnerKind;
  return "culture";
}

/** Synthetic ("Check a partner" stand-in) entries are a pure function of their name, but the
 * name itself isn't recoverable from the resulting id — so `rankTogether` keeps a small,
 * capped registry of entries it has already synthesized this process, keyed by id, to look
 * tags back up for ids it's asked to rank that didn't come from the catalog. */
const SYNTHETIC_REGISTRY = new Map<string, CatalogEntry>();
const SYNTHETIC_REGISTRY_MAX = 500;

function registerSynthetic(entry: CatalogEntry): CatalogEntry {
  if (!SYNTHETIC_REGISTRY.has(entry.id) && SYNTHETIC_REGISTRY.size >= SYNTHETIC_REGISTRY_MAX) {
    const oldestKey = SYNTHETIC_REGISTRY.keys().next().value;
    if (oldestKey !== undefined) SYNTHETIC_REGISTRY.delete(oldestKey);
  }
  SYNTHETIC_REGISTRY.set(entry.id, entry);
  return entry;
}

function syntheticCatalogEntry(name: string, entityHint?: string): CatalogEntry {
  const trimmed = name.trim();
  const tagsList = guessedTags(trimmed.toLowerCase());
  const kind = hintedKind(entityHint);
  const weights: Record<string, number> = {};
  tagsList.forEach((tag, index) => {
    weights[tag] = index === 0 ? 1 : 0.7;
  });
  return {
    id: `custom-${hashString(trimmed.toLowerCase()).toString(36)}`,
    name: trimmed,
    kind,
    entityType: ENTITY_TYPE_FOR_KIND[kind],
    blurb: `A stand-in profile for "${trimmed}" — not in the demo dataset, so Venn guessed a taste profile.`,
    tags: weights,
    audienceTags: tagsList,
    popularity: 0.5,
    trend: 0,
  };
}

/**
 * Resolves a free-text "Check a partner" name to a catalog entry, mirroring the matched /
 * keyword / guessed ladder used for anchors in `resolveOne`. Falls back to a synthetic
 * stand-in entry (same idea as a "guessed" anchor) so the demo always has something to score,
 * optionally steered towards `entityHint` (a PartnerKind or EntityType hint) when ambiguous.
 */
export function resolveCandidateEntry(name: string, entityHint?: string): CatalogEntry {
  const query = name.trim().toLowerCase();
  const exact = CATALOG.find(
    (item) => item.name.toLowerCase() === query || item.aliases?.some((alias) => alias.toLowerCase() === query),
  );
  if (exact) return exact;
  const hits = fuse.search(query, { limit: 5 });
  const withHint = entityHint
    ? hits.find((hit) => {
        const entry = CATALOG.find((item) => item.id === hit.item.id);
        return Boolean(entry && (entry.kind === entityHint || entry.entityType === entityHint));
      })
    : undefined;
  const best = withHint ?? hits[0];
  if (best) {
    const entry = CATALOG.find((item) => item.id === best.item.id);
    if (entry) return entry;
  }
  return registerSynthetic(syntheticCatalogEntry(name, entityHint));
}

/** Encodes a weighted tag map into a flat `tag:weight,tag:weight` string so it fits
 * `DiscoverSpec.params` (plain strings) and can be decoded again by `rankTogetherMock`
 * without needing the original `BusinessInput`/`ResolvedAnchor[]` — mirroring how a live Qloo
 * `rankTogether` call only needs the params it was given, not the original anchors. */
function encodeWeights(map: Map<string, number>): string {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([tag, weight]) => `${tag}:${weight.toFixed(3)}`)
    .join(",");
}

function decodeWeights(param?: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!param) return map;
  for (const pair of param.split(",")) {
    if (!pair) continue;
    const idx = pair.lastIndexOf(":");
    if (idx === -1) continue;
    const tag = pair.slice(0, idx);
    const weight = Number(pair.slice(idx + 1));
    if (tag) map.set(tag, Number.isFinite(weight) ? weight : 0.5);
  }
  return map;
}

/** Builds the `DiscoverSpec` for one mock discover call: the audience's weighted tag profile
 * (so `rankTogetherMock` can replay the same affinity math later without re-deriving it from
 * the original anchors) plus the pool of entity ids that call actually returned. */
export function discoverSpecForKind(
  input: BusinessInput,
  resolved: ResolvedAnchor[],
  kind: PartnerKind,
  poolIds: string[],
): DiscoverSpec {
  const profiles = buildProfiles(input, resolved);
  return {
    kind,
    entityType: entityTypeForKind(kind),
    params: {
      kind,
      category: profileFor(input.businessType).category,
      "signal.audience": encodeWeights(profiles.audience),
    },
    poolIds,
  };
}

/**
 * Deterministic "ranked together" affinities for the mock provider: cosine similarity between
 * the audience profile encoded in `spec.params` and each id's catalog tags. Ids outside the
 * demo catalog (synthetic "Check" entries from this process, or genuinely unknown ids) fall
 * back to a stable popularity-ish estimate derived from the id itself, so the shape of the
 * response never depends on network access.
 */
export function rankTogetherMock(spec: DiscoverSpec, extraEntityIds: string[]): RankEntry[] {
  const ids = [...new Set([...spec.poolIds, ...extraEntityIds])];
  const audience = decodeWeights(spec.params["signal.audience"]);
  return ids.map((id) => {
    const entry = CATALOG.find((item) => item.id === id) ?? SYNTHETIC_REGISTRY.get(id);
    if (!entry) {
      const roll = unitFor(hashString(id), spec.kind);
      return { entityId: id, affinity: Math.max(0.15, Math.min(0.55, roll)), popularity: 0.5 };
    }
    const tagMap = recordToMap(entry.tags);
    const affinity = audience.size > 0 ? cosine(audience, tagMap) : entry.popularity;
    return { entityId: id, affinity, popularity: entry.popularity };
  });
}

/**
 * Scores a single candidate entry using this run's frozen normalization instead of a fresh
 * one, so a newly checked partner lands on the same 52-96 scale as the rest of the run.
 */
export function scoreOneFrozen(
  input: BusinessInput,
  resolved: ResolvedAnchor[],
  entry: CatalogEntry,
  normalization: Normalization,
  medianScore: number,
): Partner {
  const seed = seedFor(input);
  const category = profileFor(input.businessType).category;
  const draft = draftPartner(input, resolved, entry, seed);
  const matchScore = stretchWithNormalization(draft.raw, normalization);
  const surprise = surpriseDistance(category, entry.kind);
  const isSurprising = surprise >= 0.6 && matchScore >= medianScore;
  return toPartner(input, draft, matchScore, surprise, isSurprising);
}

export function attachRelated(partners: Partner[]): void {
  const maps = new Map<string, Map<string, number>>();
  for (const partner of partners) {
    const entry = CATALOG.find((item) => item.id === partner.id);
    maps.set(partner.id, entry ? recordToMap(entry.tags) : listToMap(partner.tags, 1));
  }
  for (const partner of partners) {
    const mine = maps.get(partner.id) ?? new Map<string, number>();
    const ranked = partners
      .filter((other) => other.id !== partner.id)
      .map((other) => ({
        id: other.id,
        score: cosine(mine, maps.get(other.id) ?? new Map<string, number>()),
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const take = Math.min(3, ranked.length);
    partner.relatedIds = ranked.slice(0, take).map((item) => item.id);
  }
}

export function cityFor(input: BusinessInput): CityInfo | null {
  const city = matchCity(input.city);
  if (!city) return null;
  return { name: city.name, center: city.center, zoom: city.zoom, hasLocalData: true };
}

export function limitsFor(input: BusinessInput): string[] {
  const limits: string[] = [...DEMO_LIMITS];
  if (!matchCity(input.city)) limits.push(UNKNOWN_CITY_LIMIT);
  return limits;
}

export function chooseTopPicks(partners: Partner[]): TopPick[] {
  if (partners.length === 0) return [];
  const picks: TopPick[] = [];
  const used = new Set<string>();
  const best = [...partners].sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name))[0];
  if (!best) return [];
  picks.push({ role: "best_overall", partnerId: best.id, headline: "Closest overlap" });
  used.add(best.id);
  const local = [...partners]
    .filter((partner) => partner.local && !used.has(partner.id))
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name))[0];
  const fallback = [...partners]
    .filter((partner) => !used.has(partner.id))
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name))[0];
  const second = local ?? fallback;
  if (second) {
    picks.push({
      role: "best_local",
      partnerId: second.id,
      headline: second.local ? "Right around the corner" : "Next strongest fit",
    });
    used.add(second.id);
  }
  const remaining = partners.filter((partner) => !used.has(partner.id));
  const surprising = remaining.filter((partner) => partner.isSurprising);
  const pool = surprising.length > 0 ? surprising : remaining;
  const wildcard = [...pool].sort(
    (a, b) => b.matchScore * b.surprise - a.matchScore * a.surprise || b.matchScore - a.matchScore,
  )[0];
  if (wildcard) {
    picks.push({ role: "wildcard", partnerId: wildcard.id, headline: "Unexpected but strong" });
  }
  return picks;
}

export function headlineFor(partners: Partner[], picks: TopPick[]): string {
  const top = partners.find((partner) => partner.id === picks[0]?.partnerId) ?? partners[0];
  if (!top) return "Venn could not find a strong overlap in the demo set.";
  const kinds = new Set(partners.map((partner) => partner.kind)).size;
  return `${top.name} is your strongest overlap. Venn found ${partners.length} partners across ${kinds} types.`;
}

export function notesFor(input: BusinessInput, resolved: ResolvedAnchor[], retries: number): string[] {
  const matched = resolved.filter((item) => item.status === "matched").length;
  const keyword = resolved.filter((item) => item.status === "keyword").length;
  const guessed = resolved.filter((item) => item.status === "guessed").length;
  const notes = [
    `Read ${resolved.length} interests: ${matched} matched to known names, ${keyword} read as interests, ${guessed} given a stand-in profile.`,
  ];
  if (!matchCity(input.city)) {
    notes.push(`${input.city.trim()} is outside the demo cities, so this search uses global brands and artists only.`);
  }
  if (retries > 0) notes.push("The first pass was thin, so Venn widened the search.");
  return notes;
}

export function keepForKind(found: Candidate[], kindIndex: number): Candidate[] {
  const count = kindIndex < 2 ? 4 : 3;
  return found.slice(0, count);
}

export function strongCount(partners: Partner[], threshold = 0.18): number {
  return partners.filter((partner) => rawFromSignals(partner.signals) >= threshold).length;
}

export function expandFrom(result: RunResult, partnerId: string): { added: Partner[]; message?: string } {
  const parent = result.partners.find((partner) => partner.id === partnerId);
  if (!parent) return { added: [], message: "That partner is not in this search." };
  if (result.partners.length >= 28) {
    return { added: [], message: "This map already has 28 partners, which is the limit." };
  }
  const parentEntry = CATALOG.find((item) => item.id === parent.id);
  const parentMap = parentEntry ? recordToMap(parentEntry.tags) : listToMap(parent.tags, 1);
  const existing = new Set(result.partners.map((partner) => partner.id));
  const category = profileFor(result.input.businessType).category;
  const city = matchCity(result.input.city);
  const similar = CATALOG.filter((item) => {
    if (existing.has(item.id)) return false;
    if (item.city && (!city || item.city !== city.name)) return false;
    if (item.city && item.kind === category) return false;
    return true;
  })
    .map((item) => ({ item, score: cosine(parentMap, recordToMap(item.tags)) }))
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, 4);
  const room = 28 - result.partners.length;
  const chosen = similar.slice(0, room);
  if (chosen.length === 0) {
    return { added: [], message: "No further connections in the demo set." };
  }
  const seed = seedFor(result.input) ^ hashString(`expand|${partnerId}`);
  const drafts = chosen.map(({ item }) => draftPartner(result.input, result.resolvedAnchors, item, seed));
  const existingRaw = result.partners.map((partner) => rawFromSignals(partner.signals));
  const min = existingRaw.length > 0 ? Math.min(...existingRaw) : 0;
  const max = existingRaw.length > 0 ? Math.max(...existingRaw) : 1;
  const mid = median(result.partners.map((partner) => partner.matchScore));
  const categoryKind = category;
  const added = drafts.map((draft) => {
    const score = stretch(draft.raw, min, max);
    const surprise = surpriseDistance(categoryKind, draft.entry.kind);
    const partner = toPartner(result.input, draft, score, surprise, surprise >= 0.6 && score >= mid);
    partner.parentId = parent.id;
    partner.expanded = true;
    return partner;
  });
  return { added };
}

export function heatmapFor(result: RunResult, partnerId: string): Heatmap | null {
  const city = matchCity(result.input.city);
  const info = cityFor(result.input);
  if (!city || !info) return null;
  const partner = result.partners.find((item) => item.id === partnerId);
  if (!partner) return null;
  const profiles = buildProfiles(result.input, result.resolvedAnchors);
  const entry = CATALOG.find((item) => item.id === partner.id);
  const partnerTags = entry ? recordToMap(entry.tags) : listToMap(partner.tags, 1);
  const rawA = city.neighbourhoods.map((area) => cosine(recordToMap(recordCharacter(area.character)), profiles.audience));
  const rawB = city.neighbourhoods.map((area) => cosine(recordToMap(recordCharacter(area.character)), partnerTags));
  const scale = (values: number[]): number[] => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return values.map((value) => (max - min < 1e-9 ? 0.55 : 0.15 + ((value - min) / (max - min)) * 0.85));
  };
  const intensityA = scale(rawA);
  const intensityB = scale(rawB);
  const spots: HeatSpot[] = city.neighbourhoods.map((area, index) => {
    const a = intensityA[index] ?? 0.55;
    const b = intensityB[index] ?? 0.55;
    const shared = Object.entries(area.character)
      .filter(([tag]) => (profiles.audience.get(tag) ?? 0) > 0 || (partnerTags.get(tag) ?? 0) > 0)
      .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0));
    const first = shared[0]?.[0] ?? Object.entries(area.character).sort((l, r) => (r[1] ?? 0) - (l[1] ?? 0))[0]?.[0];
    const second = shared[1]?.[0] ?? Object.entries(area.character).sort((l, r) => (r[1] ?? 0) - (l[1] ?? 0))[1]?.[0];
    const why =
      first && second
        ? `Strong on ${tagLabel(first)} and ${tagLabel(second)}.`
        : first
          ? `Strong on ${tagLabel(first)}.`
          : "A quieter pocket of the city.";
    return {
      id: area.id,
      name: area.name,
      lat: area.lat,
      lng: area.lng,
      intensityA: a,
      intensityB: b,
      overlap: Math.sqrt(a * b),
      rank: null,
      why,
    };
  });
  const ranked = [...spots].sort((a, b) => b.overlap - a.overlap || a.name.localeCompare(b.name));
  ranked.slice(0, 3).forEach((spot, index) => {
    const target = spots.find((item) => item.id === spot.id);
    if (target) target.rank = index + 1;
  });
  return {
    runId: result.runId,
    partnerId: partner.id,
    partnerName: partner.name,
    city: info,
    spots,
    caption: `Where your crowd and ${partner.name}'s crowd overlap in ${city.name}.`,
  };
}

function recordCharacter(character: Partial<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(character)) {
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

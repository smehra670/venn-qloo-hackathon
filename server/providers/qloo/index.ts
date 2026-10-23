import { MAX_PARTNERS } from "@shared/constants";
import type {
  BusinessInput,
  CityInfo,
  CrowdTag,
  DiscoverSpec,
  EntityType,
  Heatmap,
  MatchDriver,
  Normalization,
  Partner,
  PartnerKind,
  RankEntry,
  ResolvedAnchor,
  RunResult,
} from "@shared/types";
import { PARTNER_KINDS } from "@shared/types";
import { nameSimilarity } from "../../anchors/status.js";
import { looksLikeMediaOrContent } from "../../agent/reachable.js";
import { profileFor } from "../mock/profiles.js";
import { ABSOLUTE_NORMALIZATION, mutualAffinity, stretchWithNormalization } from "../scoring.js";
import type { Candidate, ProviderContext, ProviderEntity, TasteProvider } from "../types.js";
import type { CardsRequest, CardsResponse, RefillRequest, RefillResponse } from "@shared/schemas";
import { createQlooCardSource } from "../../anchors/cards.js";
import { anchorEntityType } from "@shared/anchorType";
import {
  affinityOf,
  entityIdOf,
  entityNameOf,
  getCircuitState,
  insights,
  isQuotaBelowFloor,
  searchEntities,
  searchTags,
  tagInsights,
  typesOf,
  type QlooEntity,
  type TagAffinity,
} from "./client.js";
import {
  attachRelatedByAffinity,
  blurbFromEntity,
  buildPartner,
  chunk,
  cityInfoFromSearch,
  entityTypeFromUrns,
  filterTypeForEntityType,
  heatmapSpotsFromQloo,
  kindFromEntityTypes,
  LOCAL_PLACE_RADIUS_M,
  paramsToStrings,
  searchTypesForAnchor,
  tagLabelsFromEntity,
  toProviderEntity,
} from "./mapping.js";
import {
  CROWD_TAG_TYPES,
  isCompetitorBrand,
  isCompetitorPlace,
  isExcludedBrand,
  isExcludedPlace,
  isMusicGenreTag,
  KIND_BRAND_GENRES,
  KIND_PLACE_CATEGORIES,
  matchesKindCategories,
  placeCategoryForTopic,
} from "./taxonomy.js";

/** Candidates kept per discover call, and how many get the (paid) reverse + crowd checks. */
const PLACE_TAKE = 15;
const BRAND_TAKE = 12;
const SHORTLIST = 12;
/** How many of your crowd's top tags (per vocabulary) to look for on partners. */
const CROWD_TAGS = 25;
/** Your crowd's tastes below this affinity aren't worth calling "shared". */
const CROWD_FLOOR = 0.5;
/** Max entities sent as `signal.interests.entities` (real anchors first, then topic proxies). */
const MAX_SIGNALS = 6;
/** When only one direction of the fit could be measured, the score is discounted by this much
 * (and the evidence says so) so it can't outrank partners measured both ways. */
const ONE_WAY_DISCOUNT = 0.9;

/**
 * Picks the search result to centre a city on. Qloo's `destination` entity is the well-known
 * city with a correct centre (Edinburgh, Scotland; Tokyo), whereas the first `locality` can be a
 * same-named town abroad (Edinburgh, Indiana) or a prefecture centroid at sea (東京都). Fall back to
 * the first locality (Cambridge, Manchester), then any result (small towns only have places).
 */
function pickCityEntity(results: QlooEntity[]): QlooEntity | null {
  const isA = (item: QlooEntity, type: string) => typesOf(item).some((t) => t.includes(type));
  return results.find((item) => isA(item, "destination")) ?? results.find((item) => isA(item, "locality")) ?? results[0] ?? null;
}

function cacheKey(path: string, params: Record<string, unknown>): string {
  return `${path}?${JSON.stringify(params)}`;
}

/** The taste signal a run sends to Qloo: your named anchors plus stand-ins for topic anchors. */
interface SignalSet {
  /** Entity ids to send as `signal.interests.entities`, real anchors first. */
  ids: string[];
  /** Real (user-named) anchor ids grouped by entity type, for the reverse-affinity check. */
  anchorsByType: Map<EntityType, string[]>;
  /** Topic proxies grouped by entity type — used for the reverse check only when no real anchors. */
  proxiesByType: Map<EntityType, string[]>;
  /** Entity id -> the anchor name to credit in "why they match" (proxies credit their topic). */
  labels: Map<string, string>;
}

function signalsFrom(resolved: ResolvedAnchor[]): SignalSet {
  const anchorsByType = new Map<EntityType, string[]>();
  const proxiesByType = new Map<EntityType, string[]>();
  const labels = new Map<string, string>();
  const anchorIds: string[] = [];
  const proxyIds: string[] = [];
  for (const item of resolved) {
    if (item.status === "matched" && item.entityId) {
      anchorIds.push(item.entityId);
      labels.set(item.entityId, item.entityName ?? item.input);
      const type = item.entityType ?? "brand";
      anchorsByType.set(type, [...(anchorsByType.get(type) ?? []), item.entityId]);
    }
    for (const proxy of item.proxies ?? []) {
      if (labels.has(proxy.id)) continue;
      proxyIds.push(proxy.id);
      labels.set(proxy.id, item.input);
      proxiesByType.set(proxy.entityType, [...(proxiesByType.get(proxy.entityType) ?? []), proxy.id]);
    }
  }
  // Keep every real anchor. Topic stand-ins only support them: with named anchors present each
  // topic gets one stand-in (three coffee shops for "specialty coffee" swamped a bookshop's
  // two named favourites); a topics-only search can use up to three per topic.
  const ids = [...new Set(anchorIds)].slice(0, MAX_SIGNALS);
  const perTopic = anchorIds.length > 0 ? 1 : 3;
  const usedByTopic = new Map<string, number>();
  for (const id of proxyIds) {
    if (ids.length >= MAX_SIGNALS) break;
    const topic = labels.get(id) ?? id;
    if ((usedByTopic.get(topic) ?? 0) >= perTopic || ids.includes(id)) continue;
    usedByTopic.set(topic, (usedByTopic.get(topic) ?? 0) + 1);
    ids.push(id);
  }
  return { ids, anchorsByType, proxiesByType, labels };
}

/** Qloo explainability -> per-anchor shares (proxies folded into their topic), largest first. */
function driversOf(entity: QlooEntity, labels: Map<string, string>): MatchDriver[] {
  const entries = entity.query?.explainability?.["signal.interests.entities"];
  if (!Array.isArray(entries)) return [];
  const byAnchor = new Map<string, number>();
  for (const item of entries) {
    const label = item?.entity_id ? labels.get(item.entity_id) : undefined;
    if (!label || typeof item.score !== "number") continue;
    byAnchor.set(label, Math.max(byAnchor.get(label) ?? 0, Math.max(0, Math.min(1, item.score))));
  }
  return [...byAnchor.entries()].map(([anchor, share]) => ({ anchor, share })).sort((a, b) => b.share - a.share);
}

/** Same-type anchor groups to ask about in the reverse check, most useful first: your named
 * anchors (largest group first), then topic stand-ins. Qloo often has no reverse reading for a
 * place against a brand (e.g. Rough Trade East vs Aesop) but does against an artist, so the
 * check falls through the groups until one answers. */
function reverseGroups(sig: SignalSet): Array<{ type: EntityType; ids: string[] }> {
  const order: EntityType[] = ["brand", "artist", "place", "person", "book", "movie", "tv_show", "podcast", "destination"];
  const groups = (source: Map<EntityType, string[]>) =>
    order
      .map((type) => ({ type, ids: (source.get(type) ?? []).slice(0, 5) }))
      .filter((group) => group.ids.length > 0)
      .sort((a, b) => b.ids.length - a.ids.length);
  return [...groups(sig.anchorsByType), ...groups(sig.proxiesByType)];
}

export class QlooTasteProvider implements TasteProvider {
  readonly name = "qloo" as const;
  readonly label = "Qloo";

  /** Swipe cards: seeded deck with exact Qloo ids, live refill from the person's Yeses. Goes
   * through the shared client, so the limiter, breaker, quota floor and call log all apply. */
  private readonly cards = createQlooCardSource({
    insights,
    quotaLow: isQuotaBelowFloor,
    circuitOpen: () => getCircuitState().open,
  });

  getSwipeCards(req: CardsRequest, signal?: AbortSignal): Promise<CardsResponse> {
    return this.cards.getSwipeCards(req, signal);
  }

  getRefillCards(req: RefillRequest, signal?: AbortSignal): Promise<RefillResponse> {
    return this.cards.getRefillCards(req, signal);
  }

  private readonly cache = new Map<string, unknown>();
  private cityCache = new Map<string, CityInfo | null>();
  /** Signal set per run (keyed by the run's input object), so `enrich` can reuse it. */
  private readonly signalsByInput = new WeakMap<BusinessInput, SignalSet>();
  /** Raw Qloo tag ids of each scored partner, per run, for the shared-taste check in `enrich`. */
  private readonly tagIdsByInput = new WeakMap<BusinessInput, Map<string, string[]>>();

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const value = await load();
    this.cache.set(key, value);
    return value;
  }

  async resolveCity(input: BusinessInput, ctx: ProviderContext): Promise<CityInfo | null> {
    const city = input.city.trim();
    if (!city) return null;
    if (this.cityCache.has(city.toLowerCase())) return this.cityCache.get(city.toLowerCase()) ?? null;

    const info = await ctx.trace(
      "search_entities",
      `city: ${city}`,
      async () => {
        const results = await searchEntities(
          {
            query: city,
            types: ["urn:entity:locality", "urn:entity:place", "urn:entity:destination"],
            take: 5,
          },
          ctx.signal,
        );
        return cityInfoFromSearch(city, pickCityEntity(results));
      },
      (value) => (value ? `${value.name} · local` : "no local geography"),
    );
    this.cityCache.set(city.toLowerCase(), info);
    return info;
  }

  async resolveAnchors(input: BusinessInput, ctx: ProviderContext): Promise<ResolvedAnchor[]> {
    let resolved: ResolvedAnchor[];
    // Prefer confirmed TasteAnchors from setup (entity ids + tag URNs) over re-searching.
    if (input.tasteAnchors && input.tasteAnchors.length > 0) {
      resolved = input.tasteAnchors.map((anchor): ResolvedAnchor => {
        if (anchor.kind === "entity") {
          return {
            input: anchor.name,
            status: "matched",
            entityId: anchor.id,
            entityName: anchor.name,
            entityType: anchorEntityType(anchor.type),
            tags: [],
            note: `Confirmed ${anchor.name} from setup.`,
          };
        }
        return {
          input: anchor.name,
          status: "keyword",
          tags: [anchor.id],
          note: `Confirmed topic ${anchor.name} from setup.`,
        };
      });
    } else {
      resolved = [];
      // Anything setup kept as a note ("food") was never a usable taste signal; re-searching it
      // here matched things like a film called "Food".
      const notes = new Set((input.anchorNotes ?? []).map((note) => note.trim().toLowerCase()));
      for (const anchor of input.anchors.filter((item) => !notes.has(item.trim().toLowerCase()))) {
        const item = await ctx.trace(
          "search_entities",
          `q: ${anchor}`,
          async () => this.resolveOne(anchor, ctx.signal),
          (result) => result.status,
        );
        resolved.push(item);
      }
    }

    // Qloo ignores most topic tags as a signal for places and brands (probed: the same list
    // comes back whatever the tag), so stand each topic in with real entities from its crowd.
    for (const item of resolved) {
      if (item.status !== "keyword") continue;
      const tagId = item.tags.find((tag) => tag.startsWith("urn:tag:"));
      const bridged = await ctx.trace(
        "get_insights",
        `topic: ${item.input}`,
        async () => this.bridgeTopic(item.input, tagId, input, ctx.signal),
        (value) =>
          value.proxies.length > 0 ? `${item.input} → ${value.proxies.map((proxy) => proxy.name).join(", ")}` : `${item.input} → no stand-ins`,
      );
      if (bridged.proxies.length > 0) {
        item.proxies = bridged.proxies;
        item.note = `${item.note} Read through ${bridged.proxies.map((proxy) => proxy.name).join(", ")}.`;
      }
      if (bridged.placeCategory) item.placeCategory = bridged.placeCategory;
    }

    this.signalsByInput.set(input, signalsFrom(resolved));
    return resolved;
  }

  /**
   * Turns a topic into real Qloo entities whose crowd shares it:
   * - a music genre ("jazz", "techno", "folk music") -> its top artists (Qloo does honour
   *   genre tags as a signal when ranking artists);
   * - a place-shaped interest ("yoga", "natural wine", "vinyl records") -> the most popular
   *   local places of that category.
   */
  private async bridgeTopic(
    topic: string,
    tagId: string | undefined,
    input: BusinessInput,
    signal: AbortSignal,
  ): Promise<{ proxies: NonNullable<ResolvedAnchor["proxies"]>; placeCategory?: string }> {
    const proxies: NonNullable<ResolvedAnchor["proxies"]> = [];
    const name = topic.trim();

    let genre = tagId && isMusicGenreTag(tagId) ? tagId : undefined;
    if (!genre) {
      const bare = name.toLowerCase().replace(/\s+music$/, "");
      try {
        const tags = await this.cached(cacheKey("/v2/tags", { q: name.toLowerCase() }), () => searchTags(name, signal, { take: 10 }));
        genre = tags.find((tag) => isMusicGenreTag(tag.id) && nameSimilarity(bare, tag.name) >= 0.85)?.id;
      } catch {
        genre = undefined;
      }
    }
    if (genre) {
      try {
        const params = { "filter.type": "urn:entity:artist", "signal.interests.tags": genre, take: 3 };
        const result = await this.cached(cacheKey("/v2/insights", params), () => insights(params, signal));
        for (const entity of result.entities.slice(0, 2)) {
          const id = entityIdOf(entity);
          if (id) proxies.push({ id, name: entityNameOf(entity), entityType: "artist" });
        }
      } catch {
        // No artists for this genre — the place route below may still bridge it.
      }
    }

    const placeCategory = placeCategoryForTopic(name);
    if (placeCategory) {
      const city = await this.resolveCityQuiet(input, signal);
      if (city?.hasLocalData) {
        const [lat, lng] = city.center;
        const params = {
          "filter.type": "urn:entity:place",
          "filter.tags": placeCategory,
          "filter.location": `POINT(${lng} ${lat})`,
          "filter.location.radius": LOCAL_PLACE_RADIUS_M,
          take: 4,
        };
        try {
          const result = await this.cached(cacheKey("/v2/insights", params), () => insights(params, signal));
          for (const entity of result.entities) {
            if (proxies.length >= 3) break;
            const id = entityIdOf(entity);
            if (!id || isExcludedPlace(entity) || entity.properties?.is_closed === true) continue;
            proxies.push({ id, name: entityNameOf(entity), entityType: "place" });
          }
        } catch {
          // Keep whatever the genre route found.
        }
      }
    }
    return { proxies: proxies.slice(0, 3), placeCategory };
  }

  private async resolveOne(anchor: string, signal: AbortSignal): Promise<ResolvedAnchor> {
    const key = cacheKey("/search", { query: anchor, types: searchTypesForAnchor() });
    const results = await this.cached(key, () =>
      searchEntities(
        {
          query: anchor,
          types: searchTypesForAnchor(),
          take: 8,
        },
        signal,
      ),
    );
    const needle = anchor.toLowerCase().trim();
    const exact = results.find((item) => entityNameOf(item).toLowerCase() === needle);
    const close = results.find((item) => {
      const name = entityNameOf(item).toLowerCase();
      return name.includes(needle) || needle.includes(name);
    });
    const best = exact ?? close;
    // Prefer tags for short interest words that only weakly match an entity name.
    const tagHits = await searchTags(anchor, signal);
    if (!exact && tagHits.length > 0 && (!best || entityNameOf(best).toLowerCase() !== needle)) {
      const strongTag = tagHits.find((tag) => tag.name.toLowerCase() === needle || tag.name.toLowerCase().includes(needle));
      if (strongTag || needle.length <= 12) {
        return {
          input: anchor,
          status: "keyword",
          tags: tagHits.slice(0, 5).map((tag) => tag.id),
          note: `Read as interest tags from Qloo (${tagHits
            .slice(0, 2)
            .map((tag) => tag.name)
            .join(", ")}).`,
        };
      }
    }
    if (best && entityIdOf(best)) {
      const tags = tagLabelsFromEntity(best).map((label) => label.toLowerCase().replace(/\s+/g, "_"));
      return {
        input: anchor,
        status: "matched",
        entityId: entityIdOf(best),
        entityName: entityNameOf(best),
        entityType: entityTypeFromUrns(typesOf(best)),
        tags: tags.length > 0 ? tags : [anchor.toLowerCase().replace(/\s+/g, "_")],
        note: `Matched to ${entityNameOf(best)} via Qloo search.`,
      };
    }

    if (tagHits.length > 0) {
      return {
        input: anchor,
        status: "keyword",
        tags: tagHits.slice(0, 5).map((tag) => tag.id),
        note: `Read as interest tags from Qloo (${tagHits
          .slice(0, 2)
          .map((tag) => tag.name)
          .join(", ")}).`,
      };
    }

    return {
      input: anchor,
      status: "guessed",
      tags: [anchor.toLowerCase().replace(/\s+/g, "_")],
      note: "No Qloo entity or tag match. Kept as a free-text interest.",
    };
  }

  async planKinds(input: BusinessInput, _resolved: ResolvedAnchor[], ctx: ProviderContext): Promise<PartnerKind[]> {
    const kinds = profileFor(input.businessType).kinds.slice(0, 6);
    await ctx.trace(
      "search_tags",
      `business: ${input.businessType}`,
      async () => kinds,
      (value) => value.join(", "),
    );
    return kinds;
  }

  async discover(
    input: BusinessInput,
    resolved: ResolvedAnchor[],
    kind: PartnerKind,
    ctx: ProviderContext,
    out?: { spec?: DiscoverSpec; specs?: DiscoverSpec[] },
  ): Promise<Candidate[]> {
    return ctx.trace(
      "get_insights",
      `kind: ${kind}, city: ${input.city}`,
      async () => this.discoverKind(input, resolved, kind, ctx.signal, out),
      (list) => `${kind} · ${list.length} candidates`,
    );
  }

  private signalsFor(input: BusinessInput, resolved: ResolvedAnchor[]): SignalSet {
    const existing = this.signalsByInput.get(input);
    if (existing) return existing;
    const sig = signalsFrom(resolved);
    this.signalsByInput.set(input, sig);
    return sig;
  }

  /**
   * One kind = up to two filtered calls: local places in the kind's categories (record shops,
   * yoga studios…) and, for retail/fashion, brands in the kind's genres. Results are dropped
   * when they're landmarks/institutions, direct competitors, or don't actually carry one of
   * the kind's categories (Qloo's tag filter leaks a little).
   */
  private async discoverKind(
    input: BusinessInput,
    resolved: ResolvedAnchor[],
    kind: PartnerKind,
    signal: AbortSignal,
    out?: { spec?: DiscoverSpec; specs?: DiscoverSpec[] },
  ): Promise<Candidate[]> {
    const sig = this.signalsFor(input, resolved);
    if (sig.ids.length === 0) return [];

    const city = await this.resolveCityQuiet(input, signal);
    const candidates: Candidate[] = [];
    const specs: DiscoverSpec[] = [];

    const run = async (entityType: "place" | "brand", params: Record<string, string | number | string[]>, local: boolean) => {
      let entities: QlooEntity[] = [];
      try {
        const result = await this.cached(cacheKey("/v2/insights", params), () => insights(params, signal));
        entities = result.entities;
      } catch {
        return;
      }
      const pool: string[] = [];
      for (const entity of entities) {
        if (entityType === "place") {
          if (isExcludedPlace(entity) || isCompetitorPlace(entity, input.businessType)) continue;
        } else if (isExcludedBrand(entity) || isCompetitorBrand(entity, input.businessType)) {
          continue;
        }
        // No affinity means the signal didn't reach this entity — it's only here for popularity.
        if (affinityOf(entity) <= 0) continue;
        if (!matchesKindCategories(entity, kind, entityType)) continue;
        const entry = toProviderEntity(entity, kind, input.city);
        if (!entry || looksLikeMediaOrContent(entry.name)) continue;
        // Qloo's point+radius search can still return the odd place past the radius.
        if (local && entry.venueFacts?.distanceM !== undefined && entry.venueFacts.distanceM > LOCAL_PLACE_RADIUS_M) continue;
        entry.kind = kind;
        entry.entityType = entityType;
        const drivers = driversOf(entity, sig.labels);
        if (drivers.length > 0) {
          entry.drivers = drivers;
          entry.explainabilityAnchorName = drivers[0]!.anchor;
          entry.explainabilityScore = drivers[0]!.share;
        }
        pool.push(entry.id);
        candidates.push({ entry, local, provisional: affinityOf(entity) });
      }
      specs.push({ kind, entityType, params: paramsToStrings(params), poolIds: pool });
    };

    if (city?.hasLocalData) {
      const [lat, lng] = city.center;
      await run(
        "place",
        {
          "filter.type": "urn:entity:place",
          "filter.tags": KIND_PLACE_CATEGORIES[kind],
          "signal.interests.entities": sig.ids,
          "filter.location": `POINT(${lng} ${lat})`,
          "filter.location.radius": LOCAL_PLACE_RADIUS_M,
          "feature.explainability": "true",
          take: PLACE_TAKE,
        },
        true,
      );
    }
    const genres = KIND_BRAND_GENRES[kind];
    if (genres) {
      await run(
        "brand",
        {
          "filter.type": "urn:entity:brand",
          "filter.tags": genres,
          "signal.interests.entities": sig.ids,
          "feature.explainability": "true",
          take: BRAND_TAKE,
        },
        false,
      );
    }

    candidates.sort((a, b) => b.provisional - a.provisional);
    if (out) {
      out.specs = specs;
      out.spec = specs[0];
    }
    return candidates;
  }

  private async resolveCityQuiet(input: BusinessInput, signal: AbortSignal): Promise<CityInfo | null> {
    const city = input.city.trim();
    if (!city) return null;
    if (this.cityCache.has(city.toLowerCase())) return this.cityCache.get(city.toLowerCase()) ?? null;
    try {
      const results = await searchEntities(
        {
          query: city,
          types: ["urn:entity:locality", "urn:entity:place", "urn:entity:destination"],
          take: 5,
        },
        signal,
      );
      const info = cityInfoFromSearch(city, pickCityEntity(results));
      this.cityCache.set(city.toLowerCase(), info);
      return info;
    } catch {
      this.cityCache.set(city.toLowerCase(), null);
      return null;
    }
  }

  /**
   * Real reverse affinity: with the partner as the signal, how strongly does its crowd rate
   * your anchors? (`filter.results.entities` = your anchors.) Probed: Rains' crowd rates Aesop
   * 0.92, Binance's 0.55 — so this separates a genuine two-way fit from a popular stranger.
   */
  private async reverseAffinities(ids: string[], sig: SignalSet, signal: AbortSignal): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const groups = reverseGroups(sig);
    if (groups.length === 0) return out;
    await Promise.all(
      ids.map(async (id) => {
        for (const group of groups) {
          const params = {
            "filter.type": filterTypeForEntityType(group.type),
            "signal.interests.entities": id,
            "filter.results.entities": group.ids,
            take: group.ids.length,
          };
          try {
            const result = await this.cached(cacheKey("/v2/insights", params), () => insights(params, signal));
            const values = result.entities.map(affinityOf).filter((value) => value > 0);
            if (values.length > 0) {
              out.set(id, values.reduce((sum, value) => sum + value, 0) / values.length);
              return;
            }
          } catch {
            // Try the next group; unmeasured partners keep the forward score and say so.
          }
        }
      }),
    );
    return out;
  }

  /** Forward affinity of specific entities to your anchors, in one call per entity type. */
  private async forwardAffinities(
    entries: Array<{ id: string; entityType: EntityType }>,
    sig: SignalSet,
    signal: AbortSignal,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (sig.ids.length === 0) return out;
    const byType = new Map<EntityType, string[]>();
    for (const entry of entries) byType.set(entry.entityType, [...(byType.get(entry.entityType) ?? []), entry.id]);
    for (const [type, ids] of byType) {
      for (const idsChunk of chunk(ids, 20)) {
        const params = {
          "filter.type": filterTypeForEntityType(type),
          "signal.interests.entities": sig.ids,
          "filter.results.entities": idsChunk,
          take: idsChunk.length,
        };
        try {
          const result = await insights(params, signal);
          for (const entity of result.entities) {
            const id = entityIdOf(entity);
            if (id) out.set(id, affinityOf(entity));
          }
        } catch {
          // Missing ids simply stay unscored.
        }
      }
    }
    return out;
  }

  async score(
    input: BusinessInput,
    resolved: ResolvedAnchor[],
    candidates: Candidate[],
    ctx: ProviderContext,
    out?: { normalization?: Normalization },
  ): Promise<Partner[]> {
    return ctx.trace(
      "score_shortlist",
      `count: ${candidates.length}`,
      async () => this.scoreCandidates(input, resolved, candidates, ctx.signal, out),
      (partners) => `${partners.length} scored`,
    );
  }

  private async scoreCandidates(
    input: BusinessInput,
    resolved: ResolvedAnchor[],
    candidates: Candidate[],
    signal: AbortSignal,
    out?: { normalization?: Normalization },
  ): Promise<Partner[]> {
    if (out) out.normalization = ABSOLUTE_NORMALIZATION;
    if (candidates.length === 0) return [];
    const unique = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const existing = unique.get(candidate.entry.id);
      if (!existing || candidate.provisional > existing.provisional) unique.set(candidate.entry.id, candidate);
    }
    // The forward affinity comes straight from each discover call; keep the strongest.
    const shortlist = [...unique.values()].sort((a, b) => b.provisional - a.provisional).slice(0, SHORTLIST);
    const sig = this.signalsFor(input, resolved);
    const tagIds = this.tagIdsByInput.get(input) ?? new Map<string, string[]>();
    for (const candidate of shortlist) if (candidate.entry.tagIds) tagIds.set(candidate.entry.id, candidate.entry.tagIds);
    this.tagIdsByInput.set(input, tagIds);
    const reverse = await this.reverseAffinities(
      shortlist.map((candidate) => candidate.entry.id),
      sig,
      signal,
    );
    const scored = shortlist.map((candidate) => {
      const from = reverse.get(candidate.entry.id);
      const mutual = from === undefined ? candidate.provisional * ONE_WAY_DISCOUNT : mutualAffinity(candidate.provisional, from);
      return { candidate, from, mutual };
    });
    const median = [...scored].map((item) => Math.round(item.mutual * 100)).sort((a, b) => a - b)[Math.floor(scored.length / 2)] ?? 74;
    const partners = scored.map(({ candidate, from, mutual }) =>
      buildPartner({
        entry: candidate.entry,
        local: candidate.local,
        affinityTo: candidate.provisional,
        affinityFrom: from ?? 0,
        affinityFromMeasured: from !== undefined,
        matchScore: stretchWithNormalization(mutual, ABSOLUTE_NORMALIZATION),
        resolved,
        input,
        median,
        absoluteScore: true,
        shared: [],
      }),
    );
    partners.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
    attachRelatedByAffinity(partners);
    return partners;
  }

  /** Your anchors' crowd's top tags across the crowd vocabularies (one call each, cached). */
  private async crowdProfile(sig: SignalSet, signal: AbortSignal): Promise<TagAffinity[]> {
    const lists = await Promise.all(
      CROWD_TAG_TYPES.map(async (type) => {
        const params = { "filter.tag.types": type, "signal.interests.entities": sig.ids, take: CROWD_TAGS };
        try {
          return await this.cached(cacheKey("/v2/insights:tags", params), () => tagInsights(params, signal));
        } catch {
          return [];
        }
      }),
    );
    const byId = new Map<string, TagAffinity>();
    for (const tag of lists.flat()) {
      if (tag.affinity < CROWD_FLOOR) continue;
      const prev = byId.get(tag.id);
      if (!prev || tag.affinity > prev.affinity) byId.set(tag.id, tag);
    }
    return [...byId.values()].sort((x, y) => y.affinity - x.affinity);
  }

  /** The partner's own crowd scored on your crowd's top tags (works for bigger brands). */
  private async crowdScores(partnerId: string, tagIds: string[], signal: AbortSignal): Promise<Map<string, number>> {
    const params = { "filter.results.tags": tagIds, "signal.interests.entities": partnerId, take: tagIds.length };
    const tags = await this.cached(cacheKey("/v2/insights:tags", params), () => tagInsights(params, signal));
    return new Map(tags.map((tag) => [tag.id, tag.affinity]));
  }

  /** Compare view: your crowd's top tastes with the partner's crowd score for each, or null when
   * Qloo can't score that crowd (most places) — the caller then shows the shared tastes instead. */
  async crowdTagsFor(anchorIds: string[], partnerId: string, signal: AbortSignal): Promise<CrowdTag[] | null> {
    const sig: SignalSet = { ids: anchorIds.slice(0, MAX_SIGNALS), anchorsByType: new Map(), proxiesByType: new Map(), labels: new Map() };
    if (sig.ids.length === 0) return null;
    const yours = (await this.crowdProfile(sig, signal)).slice(0, 12);
    if (yours.length === 0) return null;
    const theirs = await this.crowdScores(partnerId, yours.map((tag) => tag.id), signal);
    if (theirs.size < 3) return null;
    return yours.map((tag) => ({ label: tag.name, you: tag.affinity, ...(theirs.has(tag.id) ? { them: theirs.get(tag.id) } : {}) }));
  }

  /**
   * Shared tastes: your crowd's top tags (Qloo tag insights on your anchors) that Qloo also
   * attaches to each partner. Replaces the old "trend" placeholder, which never had a Qloo
   * payload behind it, and the old "shared tags", which were just the partner's own tags.
   */
  async enrich(input: BusinessInput, partners: Partner[], ctx: ProviderContext): Promise<Partner[]> {
    const sig = this.signalsByInput.get(input);
    const tagIds = this.tagIdsByInput.get(input);
    if (!sig || sig.ids.length === 0 || !tagIds || partners.length === 0) return partners;
    let profile: TagAffinity[] = [];
    try {
      profile = await ctx.trace(
        "get_insights",
        "crowd tastes: your favourites",
        async () => this.crowdProfile(sig, ctx.signal),
        (tags) => (tags.length > 0 ? tags.slice(0, 3).map((tag) => tag.name).join(", ") : "no crowd tags"),
      );
    } catch {
      return partners;
    }
    if (profile.length === 0) return partners;
    return partners.map((partner) => withCrowdTags(partner, profile, tagIds.get(partner.id) ?? []));
  }

  async expand(run: RunResult, partnerId: string, ctx: ProviderContext): Promise<Partner[]> {
    return ctx.trace(
      "get_insights",
      `expand: ${partnerId}`,
      async () => this.expandFrom(run, partnerId, ctx.signal),
      (value) => `${value.length} added`,
    );
  }

  /** "More like this": same kind and categories, seeded by the partner, then scored against
   * your anchors exactly like the original shortlist so the numbers stay comparable. */
  private async expandFrom(run: RunResult, partnerId: string, signal: AbortSignal): Promise<Partner[]> {
    const parent = run.partners.find((partner) => partner.id === partnerId);
    if (!parent) return [];
    const room = MAX_PARTNERS - run.partners.length;
    if (room <= 0) return [];

    const isPlace = parent.entityType === "place";
    const params: Record<string, string | number | string[]> = isPlace
      ? { "filter.type": "urn:entity:place", "filter.tags": KIND_PLACE_CATEGORIES[parent.kind], "signal.interests.entities": parent.id, take: 10 }
      : {
          "filter.type": "urn:entity:brand",
          "filter.tags": KIND_BRAND_GENRES[parent.kind] ?? [],
          "signal.interests.entities": parent.id,
          take: 10,
        };
    if (isPlace && run.city?.hasLocalData) {
      params["filter.location"] = `POINT(${run.city.center[1]} ${run.city.center[0]})`;
      params["filter.location.radius"] = LOCAL_PLACE_RADIUS_M;
    }
    if (Array.isArray(params["filter.tags"]) && params["filter.tags"].length === 0) delete params["filter.tags"];
    const result = await insights(params, signal);
    const existing = new Set(run.partners.map((partner) => partner.id));
    const entries: ProviderEntity[] = [];
    for (const entity of result.entities) {
      if (
        isPlace
          ? isExcludedPlace(entity) || isCompetitorPlace(entity, run.input.businessType)
          : isExcludedBrand(entity) || isCompetitorBrand(entity, run.input.businessType)
      ) {
        continue;
      }
      const entry = toProviderEntity(entity, parent.kind, run.input.city);
      if (!entry || existing.has(entry.id) || looksLikeMediaOrContent(entry.name)) continue;
      entry.entityType = isPlace ? "place" : "brand";
      entries.push(entry);
      if (entries.length >= room) break;
    }
    if (entries.length === 0) return [];

    const sig = signalsFrom(run.resolvedAnchors);
    const forward = await this.forwardAffinities(entries.map((entry) => ({ id: entry.id, entityType: entry.entityType })), sig, signal);
    const candidates: Candidate[] = entries
      .filter((entry) => forward.has(entry.id))
      .map((entry) => ({ entry, local: isPlace && parent.local, provisional: forward.get(entry.id) ?? 0 }));
    const scored = await this.scoreCandidates(run.input, run.resolvedAnchors, candidates, signal);
    return scored.map((partner) => ({
      ...partner,
      parentId: parent.id,
      expanded: true,
      blurb: partner.blurb || blurbFromEntity({ name: partner.name }),
    }));
  }

  async heatmap(run: RunResult, partnerId: string, ctx: ProviderContext): Promise<Heatmap | null> {
    return ctx.trace(
      "get_heatmap",
      `partner: ${partnerId}, city: ${run.input.city}`,
      async () => this.heatmapFor(run, partnerId, ctx.signal),
      (value) => (value ? `${value.spots.length} spots` : "no local map"),
    );
  }

  private async heatmapFor(run: RunResult, partnerId: string, signal: AbortSignal): Promise<Heatmap | null> {
    const partner = run.partners.find((item) => item.id === partnerId);
    if (!partner) return null;
    const city = run.city ?? (await this.resolveCityQuiet(run.input, signal));
    if (!city?.hasLocalData) return null;

    const entityIds = [partner.id, ...signalsFrom(run.resolvedAnchors).ids].slice(0, 5);

    const key = cacheKey("/v2/insights/heatmap", {
      partnerId,
      city: city.name,
      entities: entityIds,
    });

    // Probe-confirmed POINT+radius shape (docs/QLOO_CONTRACT_V2.md); `city.center` is `[lat, lng]`.
    const heatmapPoint = `POINT(${city.center[1]} ${city.center[0]})`;
    try {
      const result = await this.cached(key, () =>
        insights(
          {
            "filter.type": "urn:heatmap",
            "signal.interests.entities": entityIds,
            "filter.location": heatmapPoint,
            "filter.location.radius": LOCAL_PLACE_RADIUS_M,
            take: 20,
          },
          signal,
        ),
      );
      const spots = heatmapSpotsFromQloo(result.heatmap, city);
      if (spots.length === 0) {
        // Fallback: place insights near the city, treated as heat spots.
        const places = await insights(
          {
            "filter.type": "urn:entity:place",
            "signal.interests.entities": entityIds,
            "filter.location": heatmapPoint,
            "filter.location.radius": LOCAL_PLACE_RADIUS_M,
            take: 12,
          },
          signal,
        );
        const fromPlaces = places.entities
          .map((entity, index) => {
            const geo = entity.location;
            const lat = geo?.lat ?? geo?.latitude;
            const lng = geo?.lon ?? geo?.longitude;
            if (typeof lat !== "number" || typeof lng !== "number") return null;
            const intensity = Math.max(0.1, affinityOf(entity));
            return {
              id: entityIdOf(entity) ?? `place-${index}`,
              name: entityNameOf(entity),
              lat,
              lng,
              intensityA: intensity,
              intensityB: intensity * 0.85,
              overlap: intensity,
              why: "Local place affinity near your city from Qloo insights.",
              rank: null as number | null,
            };
          })
          .filter((spot): spot is NonNullable<typeof spot> => spot !== null);
        fromPlaces.sort((a, b) => b.overlap - a.overlap);
        fromPlaces.forEach((spot, index) => {
          spot.rank = index < 3 ? index + 1 : null;
        });
        if (fromPlaces.length === 0) return null;
        return {
          runId: run.runId,
          partnerId,
          partnerName: partner.name,
          city,
          spots: fromPlaces,
          caption: `Where crowds that like ${partner.name} concentrate around ${city.name}.`,
        };
      }
      return {
        runId: run.runId,
        partnerId,
        partnerName: partner.name,
        city,
        spots,
        caption: `Where crowds that like ${partner.name} concentrate around ${city.name}.`,
      };
    } catch {
      return null;
    }
  }

  async checkPartner(
    input: BusinessInput,
    resolved: ResolvedAnchor[],
    query: { name: string; entityHint?: string },
    frozen: { normalization: Normalization; medianScore: number },
    ctx: ProviderContext,
  ): Promise<Partner | null> {
    return ctx.trace(
      "search_entities",
      `check: ${query.name}`,
      async () => this.checkPartnerEntity(input, resolved, query, frozen, ctx.signal),
      (partner) => (partner ? `${partner.name} · ${partner.matchScore}` : "no match"),
    );
  }

  private async checkPartnerEntity(
    input: BusinessInput,
    resolved: ResolvedAnchor[],
    query: { name: string; entityHint?: string },
    frozen: { normalization: Normalization; medianScore: number },
    signal: AbortSignal,
  ): Promise<Partner | null> {
    const hintKind =
      query.entityHint && (PARTNER_KINDS as readonly string[]).includes(query.entityHint)
        ? (query.entityHint as PartnerKind)
        : undefined;
    const types = hintKind ? ["urn:entity:place", "urn:entity:brand"] : searchTypesForAnchor();
    let results: QlooEntity[] = [];
    try {
      results = await searchEntities({ query: query.name, types, take: 5 }, signal);
    } catch {
      return null;
    }
    const best = results[0];
    if (!best) return null;
    const kind = hintKind ?? kindFromEntityTypes(typesOf(best), "culture");
    const entry = toProviderEntity(best, kind, input.city);
    if (!entry) return null;

    const sig = signalsFrom(resolved);
    const forward = await this.forwardAffinities([{ id: entry.id, entityType: entry.entityType }], sig, signal);
    const reverse = await this.reverseAffinities([entry.id], sig, signal);
    const to = forward.get(entry.id) ?? 0;
    const from = reverse.get(entry.id);
    const matchScore = stretchWithNormalization(
      from === undefined && frozen.normalization.absolute ? to * ONE_WAY_DISCOUNT : mutualAffinity(to, from),
      frozen.normalization,
    );
    const partner = buildPartner({
      entry,
      local: false,
      affinityTo: to,
      affinityFrom: from ?? 0,
      affinityFromMeasured: from !== undefined,
      matchScore,
      resolved,
      input,
      median: frozen.medianScore,
      absoluteScore: Boolean(frozen.normalization.absolute),
      shared: [],
    });
    return { ...partner, userAdded: true };
  }

  async rankTogether(spec: DiscoverSpec, extraEntityIds: string[], ctx: ProviderContext): Promise<RankEntry[]> {
    return ctx.trace(
      "get_insights",
      `rank_together: ${spec.kind}, pool: ${spec.poolIds.length}`,
      async () => this.rankTogetherEntities(spec, extraEntityIds, ctx.signal),
      (list) => `${list.length} ranked`,
    );
  }

  private async rankTogetherEntities(
    spec: DiscoverSpec,
    extraEntityIds: string[],
    signal: AbortSignal,
  ): Promise<RankEntry[]> {
    const ids = [...new Set([...spec.poolIds, ...extraEntityIds])];
    if (ids.length === 0) return [];
    const filterType = filterTypeForEntityType(spec.entityType);
    const byId = new Map<string, RankEntry>();
    // Qloo's `filter.results.entities` is probed to work up to ~20 ids per call; chunk and
    // merge rather than risking a dropped/odd response on a larger ask.
    for (const idsChunk of chunk(ids, 20)) {
      const params: Record<string, string | number | string[]> = {
        ...spec.params,
        "filter.type": filterType,
        "filter.results.entities": idsChunk,
        take: idsChunk.length,
      };
      try {
        const result = await insights(params, signal);
        for (const entity of result.entities) {
          const id = entityIdOf(entity);
          if (!id) continue;
          byId.set(id, {
            entityId: id,
            affinity: affinityOf(entity),
            popularity: typeof entity.popularity === "number" ? Math.max(0, Math.min(1, entity.popularity)) : 0,
          });
        }
      } catch {
        // A failed chunk just means fewer ranked ids come back; the caller (Proof) degrades
        // gracefully rather than throwing the whole comparison away.
      }
    }
    return [...byId.values()];
  }
}

/**
 * Applies real shared-taste evidence to a partner: `sharedTags` become your crowd's top tastes
 * that Qloo also tags this partner with (strongest for your crowd first), and the evidence /
 * reason text is rewritten from them. `crowdTags` keeps your top tastes for the charts.
 */
export function withCrowdTags(
  partner: Partner,
  profile: Array<{ id: string; name: string; affinity: number }>,
  partnerTagIds: string[],
): Partner {
  const own = new Set(partnerTagIds);
  const sharedTags = profile.filter((tag) => own.has(tag.id));
  const shared = sharedTags.slice(0, 4).map((tag) => tag.name);
  const crowdTags: CrowdTag[] = [
    ...sharedTags.slice(0, 6),
    ...profile.filter((tag) => !own.has(tag.id)).slice(0, Math.max(0, 8 - Math.min(6, sharedTags.length))),
  ].map((tag) => ({ label: tag.name, you: tag.affinity, onPartner: own.has(tag.id) }));
  const evidence = partner.evidence.map((item) =>
    item.label === "Shared tastes"
      ? shared.length > 0
        ? {
            label: "Shared tastes",
            value: `${shared.join(", ")} — your crowd's top tastes that Qloo also tags ${partner.name} with.`,
            origin: "data" as const,
          }
        : { label: "Shared tastes", value: `None of your crowd's top tastes are on ${partner.name}'s Qloo profile.`, origin: "data" as const }
      : item,
  );
  const reasons = [...partner.reasons];
  if (shared.length > 0) reasons[0] = `${partner.name} fits your crowd's taste for ${shared.slice(0, 2).join(" and ").toLowerCase()}.`;
  return {
    ...partner,
    sharedTags: shared,
    crowdTags,
    reasons,
    evidence,
    signals: { ...partner.signals, tagOverlap: profile.length > 0 ? Math.min(1, sharedTags.length / 5) : 0 },
  };
}

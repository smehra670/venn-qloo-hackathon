import { MAX_PARTNERS } from "@shared/constants";
import type {
  BusinessInput,
  CityInfo,
  DiscoverSpec,
  Heatmap,
  Normalization,
  Partner,
  PartnerKind,
  RankEntry,
  ResolvedAnchor,
  RunResult,
} from "@shared/types";
import { PARTNER_KINDS } from "@shared/types";
import { profileFor } from "../mock/profiles.js";
import { stretchWithNormalization } from "../scoring.js";
import type { Candidate, ProviderContext, ProviderEntity, TasteProvider } from "../types.js";
import {
  affinityOf,
  entityIdOf,
  entityNameOf,
  insights,
  searchEntities,
  searchTags,
  typesOf,
  type QlooEntity,
} from "./client.js";
import {
  attachRelatedByAffinity,
  blurbFromEntity,
  buildPartner,
  businessSignalFilter,
  chunk,
  cityInfoFromSearch,
  entityTypeForKind,
  entityTypeFromUrns,
  filterTypeForEntityType,
  filterTypeForKind,
  heatmapSpotsFromQloo,
  kindFromEntityTypes,
  paramsToStrings,
  searchTypesForAnchor,
  stretchScores,
  tagLabelsFromEntity,
  toProviderEntity,
} from "./mapping.js";

function cacheKey(path: string, params: Record<string, unknown>): string {
  return `${path}?${JSON.stringify(params)}`;
}

export class QlooTasteProvider implements TasteProvider {
  readonly name = "qloo" as const;
  readonly label = "Qloo";

  private readonly cache = new Map<string, unknown>();
  private cityCache = new Map<string, CityInfo | null>();

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
        const best =
          results.find((item) => typesOf(item).some((type) => type.includes("locality"))) ??
          results.find((item) => typesOf(item).some((type) => type.includes("destination"))) ??
          results[0] ??
          null;
        return cityInfoFromSearch(city, best);
      },
      (value) => (value ? `${value.name} · local` : "no local geography"),
    );
    this.cityCache.set(city.toLowerCase(), info);
    return info;
  }

  async resolveAnchors(input: BusinessInput, ctx: ProviderContext): Promise<ResolvedAnchor[]> {
    const resolved: ResolvedAnchor[] = [];
    for (const anchor of input.anchors) {
      const item = await ctx.trace(
        "search_entities",
        `q: ${anchor}`,
        async () => this.resolveOne(anchor, ctx.signal),
        (result) => result.status,
      );
      resolved.push(item);
      if (item.status === "keyword") {
        await ctx.trace(
          "search_tags",
          `q: ${item.input}`,
          async () => item.tags,
          (tags) => tags.join(", ") || "none",
        );
      }
    }
    return resolved;
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
          tags: tagHits.slice(0, 5).map((tag) => tag.name.toLowerCase().replace(/\s+/g, "_")),
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
        tags: tagHits.slice(0, 5).map((tag) => tag.name.toLowerCase().replace(/\s+/g, "_")),
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
    out?: { spec?: DiscoverSpec },
  ): Promise<Candidate[]> {
    return ctx.trace(
      "get_insights",
      `kind: ${kind}, city: ${input.city}`,
      async () => this.discoverKind(input, resolved, kind, ctx.signal, out),
      (list) => `${kind} · ${list.length} candidates`,
    );
  }

  private async discoverKind(
    input: BusinessInput,
    resolved: ResolvedAnchor[],
    kind: PartnerKind,
    signal: AbortSignal,
    out?: { spec?: DiscoverSpec },
  ): Promise<Candidate[]> {
    const entityIds = resolved
      .filter((item) => item.status === "matched" && item.entityId)
      .map((item) => item.entityId!)
      .slice(0, 5);
    const tagIds = resolved.flatMap((item) => (item.status === "keyword" ? item.tags : [])).slice(0, 5);
    if (entityIds.length === 0 && tagIds.length === 0) return [];

    const filterType = filterTypeForKind(kind);
    const city = await this.resolveCityQuiet(input, signal);
    const params: Record<string, string | number | string[]> = {
      "filter.type": filterType,
      take: 12,
    };
    if (entityIds.length > 0) params["signal.interests.entities"] = entityIds;
    if (tagIds.length > 0 && entityIds.length === 0) {
      // Tags from resolve are humanized; Qloo wants tag URNs. Prefer entities when available.
      // When only keywords exist, search brands/places by the original anchor text instead.
      // No `DiscoverSpec` here: a text search isn't a replayable rank-together shape.
      return this.discoverBySearch(input, kind, signal);
    }
    if (city?.hasLocalData && filterType === "urn:entity:place") {
      params["filter.location"] = `${city.center[0]},${city.center[1]}`;
      params["filter.radius"] = 25;
    }

    const key = cacheKey("/v2/insights", params);
    let entities: QlooEntity[] = [];
    try {
      const result = await this.cached(key, () => insights(params, signal));
      entities = result.entities;
    } catch {
      return this.discoverBySearch(input, kind, signal);
    }

    const businessCategory = profileFor(input.businessType).category;
    const candidates: Candidate[] = [];
    for (const entity of entities) {
      const entry = toProviderEntity(entity, kindFromEntityTypes(typesOf(entity), kind), input.city);
      if (!entry) continue;
      entry.kind = kind;
      entry.entityType = entityTypeFromUrns(typesOf(entity)) || entry.entityType;
      const local = Boolean(city?.hasLocalData && filterType === "urn:entity:place");
      if (local && kind === businessCategory) continue;
      candidates.push({
        entry,
        local,
        provisional: Math.max(affinityOf(entity), entry.popularity * 0.5),
      });
    }
    candidates.sort((a, b) => b.provisional - a.provisional);
    if (out) {
      out.spec = {
        kind,
        entityType: entityTypeForKind(kind),
        params: paramsToStrings(params),
        poolIds: candidates.map((candidate) => candidate.entry.id),
      };
    }
    return candidates;
  }

  private async discoverBySearch(
    input: BusinessInput,
    kind: PartnerKind,
    signal: AbortSignal,
  ): Promise<Candidate[]> {
    const query = `${input.anchors.slice(0, 2).join(" ")} ${kind}`.trim();
    const filterType = filterTypeForKind(kind);
    const results = await searchEntities(
      {
        query,
        types: [filterType],
        take: 10,
      },
      signal,
    );
    const candidates: Candidate[] = [];
    for (const entity of results) {
      const entry = toProviderEntity(entity, kind, input.city);
      if (!entry) continue;
      candidates.push({
        entry,
        local: false,
        provisional: Math.max(0.2, affinityOf(entity) || entry.popularity || 0.35),
      });
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
      const best =
        results.find((item) => typesOf(item).some((type) => type.includes("locality"))) ?? results[0] ?? null;
      const info = cityInfoFromSearch(city, best);
      this.cityCache.set(city.toLowerCase(), info);
      return info;
    } catch {
      this.cityCache.set(city.toLowerCase(), null);
      return null;
    }
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
    if (candidates.length === 0) return [];
    const unique = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const existing = unique.get(candidate.entry.id);
      if (!existing || candidate.provisional > existing.provisional) unique.set(candidate.entry.id, candidate);
    }
    const list = [...unique.values()];
    const reverseById = new Map<string, number>();
    const filterType = businessSignalFilter(input.businessType);

    // Cap reverse lookups and run them serially to stay under hackathon rate limits.
    for (const candidate of list.slice(0, 8)) {
      const key = cacheKey("/v2/insights/reverse", {
        entity: candidate.entry.id,
        filterType,
      });
      try {
        const result = await this.cached(key, () =>
          insights(
            {
              "filter.type": filterType,
              "signal.interests.entities": candidate.entry.id,
              take: 5,
            },
            signal,
          ),
        );
        const top = result.entities[0];
        reverseById.set(candidate.entry.id, top ? Math.max(0.15, affinityOf(top)) : 0.25);
      } catch {
        reverseById.set(candidate.entry.id, Math.max(0.2, candidate.provisional * 0.8));
      }
    }
    for (const candidate of list.slice(8)) {
      reverseById.set(candidate.entry.id, Math.max(0.2, candidate.provisional * 0.85));
    }

    const raw = list.map((candidate) => {
      const to = Math.max(0.05, candidate.provisional);
      const from = reverseById.get(candidate.entry.id) ?? to * 0.85;
      const harmonic = to > 0 && from > 0 ? (2 * to * from) / (to + from) : to;
      return harmonic;
    });
    const scores = stretchScores(raw, out);
    const median = [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)] ?? 74;
    const partners = list.map((candidate, index) =>
      buildPartner({
        entry: candidate.entry,
        local: candidate.local,
        affinityTo: Math.max(0.05, candidate.provisional),
        affinityFrom: reverseById.get(candidate.entry.id) ?? Math.max(0.05, candidate.provisional * 0.85),
        matchScore: scores[index] ?? 74,
        resolved,
        input,
        median,
      }),
    );
    partners.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
    attachRelatedByAffinity(partners);
    return partners;
  }

  async enrich(input: BusinessInput, partners: Partner[], ctx: ProviderContext): Promise<Partner[]> {
    const top = [...partners].sort((a, b) => b.matchScore - a.matchScore).slice(0, 12);
    for (const partner of top) {
      await ctx.trace(
        "get_trends",
        `entity: ${partner.name}`,
        async () => {
          // Hackathon keys may not expose a dedicated trends path; keep evidence honest.
          const existing = partner.evidence.find((item) => item.label === "Trend");
          if (existing) return existing.value;
          partner.evidence.push({
            label: "Trend",
            value: "Steady in this search (no separate Qloo trend payload).",
            origin: "interpretation",
          });
          return "Steady";
        },
        (value) => `${partner.name}: ${value}`,
      );
    }
    void input;
    return partners;
  }

  async expand(run: RunResult, partnerId: string, ctx: ProviderContext): Promise<Partner[]> {
    return ctx.trace(
      "get_insights",
      `expand: ${partnerId}`,
      async () => this.expandFrom(run, partnerId, ctx.signal),
      (value) => `${value.length} added`,
    );
  }

  private async expandFrom(run: RunResult, partnerId: string, signal: AbortSignal): Promise<Partner[]> {
    const parent = run.partners.find((partner) => partner.id === partnerId);
    if (!parent) return [];
    const room = MAX_PARTNERS - run.partners.length;
    if (room <= 0) return [];

    const filterType = filterTypeForKind(parent.kind);
    const result = await insights(
      {
        "filter.type": filterType,
        "signal.interests.entities": parent.id,
        take: Math.min(6, room + 2),
      },
      signal,
    );
    const existing = new Set(run.partners.map((partner) => partner.id));
    const addedEntities = result.entities
      .map((entity) => toProviderEntity(entity, parent.kind, run.input.city))
      .filter((entry): entry is ProviderEntity => Boolean(entry && !existing.has(entry.id)))
      .slice(0, room);

    if (addedEntities.length === 0) return [];

    const candidates: Candidate[] = addedEntities.map((entry) => ({
      entry,
      local: parent.local,
      provisional: Math.max(0.2, entry.popularity),
    }));
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

    const entityIds = [
      partner.id,
      ...run.resolvedAnchors.filter((item) => item.entityId).map((item) => item.entityId!),
    ].slice(0, 5);

    const key = cacheKey("/v2/insights/heatmap", {
      partnerId,
      city: city.name,
      entities: entityIds,
    });

    try {
      const result = await this.cached(key, () =>
        insights(
          {
            "filter.type": "urn:heatmap",
            "signal.interests.entities": entityIds,
            "filter.location": `${city.center[0]},${city.center[1]}`,
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
            "filter.location": `${city.center[0]},${city.center[1]}`,
            "filter.radius": 20,
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
    const types = hintKind ? [filterTypeForKind(hintKind)] : searchTypesForAnchor();
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

    const to = Math.max(0.05, affinityOf(best) || entry.popularity || 0.3);
    let from = to * 0.85;
    try {
      const filterType = businessSignalFilter(input.businessType);
      const reverse = await insights(
        { "filter.type": filterType, "signal.interests.entities": entry.id, take: 5 },
        signal,
      );
      const top = reverse.entities[0];
      if (top) from = Math.max(0.15, affinityOf(top));
    } catch {
      // Keep the heuristic fallback; Check-a-partner should still succeed without a reverse hit.
    }
    const harmonic = to > 0 && from > 0 ? (2 * to * from) / (to + from) : to;
    const matchScore = stretchWithNormalization(harmonic, frozen.normalization);
    const partner = buildPartner({
      entry,
      local: false,
      affinityTo: to,
      affinityFrom: from,
      matchScore,
      resolved,
      input,
      median: frozen.medianScore,
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

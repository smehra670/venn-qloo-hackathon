import type {
  BusinessInput,
  BusinessType,
  CityInfo,
  EntityType,
  EvidenceItem,
  Normalization,
  Partner,
  PartnerKind,
  ResolvedAnchor,
  SignalBreakdown,
  VenueFacts,
} from "@shared/types";
import type { ProviderEntity } from "../types.js";
import { profileFor } from "../mock/profiles.js";
import { computeNormalization, stretchWithNormalization } from "../scoring.js";
import {
  affinityOf,
  entityIdOf,
  entityNameOf,
  typesOf,
  type QlooEntity,
} from "./client.js";

/** Radius (metres) used for the local place point+radius discover call (see `discoverKind` in
 * `index.ts`) and to discard any returned place further than this from the search centre. */
export const LOCAL_PLACE_RADIUS_M = 8000;

export type QlooFilterType =
  | "urn:entity:artist"
  | "urn:entity:brand"
  | "urn:entity:place"
  | "urn:entity:person"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:movie"
  | "urn:entity:book"
  | "urn:entity:destination"
  | "urn:heatmap";

const KIND_FILTER: Record<PartnerKind, QlooFilterType> = {
  music: "urn:entity:artist",
  retail: "urn:entity:brand",
  fashion: "urn:entity:brand",
  food: "urn:entity:place",
  drink: "urn:entity:place",
  venue: "urn:entity:place",
  fitness: "urn:entity:place",
  wellness: "urn:entity:brand",
  culture: "urn:entity:place",
};

const KIND_ENTITY: Record<PartnerKind, EntityType> = {
  music: "artist",
  retail: "brand",
  fashion: "brand",
  food: "place",
  drink: "place",
  venue: "place",
  fitness: "place",
  wellness: "brand",
  culture: "place",
};

export function filterTypeForKind(kind: PartnerKind): QlooFilterType {
  return KIND_FILTER[kind];
}

export function entityTypeForKind(kind: PartnerKind): EntityType {
  return KIND_ENTITY[kind];
}

const ENTITY_TYPE_FILTER: Record<EntityType, QlooFilterType> = {
  artist: "urn:entity:artist",
  brand: "urn:entity:brand",
  place: "urn:entity:place",
  person: "urn:entity:person",
  podcast: "urn:entity:podcast",
  tv_show: "urn:entity:tv_show",
  movie: "urn:entity:movie",
  book: "urn:entity:book",
  destination: "urn:entity:destination",
};

/** Inverse of `entityTypeForKind`-ish: the Qloo URN to filter by for a `DiscoverSpec.entityType`,
 * used by `rankTogether` to replay the same filter.type as the original discover call. */
export function filterTypeForEntityType(entityType: EntityType): QlooFilterType {
  return ENTITY_TYPE_FILTER[entityType] ?? "urn:entity:brand";
}

/** Converts the mixed string/number/array param bag used for a live Qloo call into the plain
 * `Record<string, string>` shape `DiscoverSpec.params` persists (and that `rankTogether` later
 * replays), so a spec is plain JSON and safe to store on `RunResult`. */
export function paramsToStrings(params: Record<string, string | number | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function searchTypesForAnchor(): string[] {
  return [
    "urn:entity:brand",
    "urn:entity:artist",
    "urn:entity:place",
    "urn:entity:person",
    "urn:entity:podcast",
    "urn:entity:movie",
    "urn:entity:tv_show",
    "urn:entity:book",
  ];
}

export function businessSignalFilter(type: BusinessType): QlooFilterType {
  const category = profileFor(type).category;
  return filterTypeForKind(category);
}

export function entityTypeFromUrns(types: string[]): EntityType {
  const joined = types.join(" ").toLowerCase();
  if (joined.includes("artist")) return "artist";
  if (joined.includes("brand")) return "brand";
  if (joined.includes("place")) return "place";
  if (joined.includes("person")) return "person";
  if (joined.includes("podcast")) return "podcast";
  if (joined.includes("tv_show") || joined.includes("tv")) return "tv_show";
  if (joined.includes("movie")) return "movie";
  if (joined.includes("book")) return "book";
  if (joined.includes("destination")) return "destination";
  return "brand";
}

export function kindFromEntityTypes(types: string[], fallback: PartnerKind): PartnerKind {
  const joined = types.join(" ").toLowerCase();
  if (joined.includes("artist")) return "music";
  if (joined.includes("brand")) return fallback === "fashion" ? "fashion" : "retail";
  if (joined.includes("place")) return fallback;
  return fallback;
}

export function tagLabelsFromEntity(entity: QlooEntity): string[] {
  const tags = entity.tags ?? [];
  const labels: string[] = [];
  for (const tag of tags) {
    const rawId = tag.tag_id ?? tag.id;
    const name = tag.name?.trim() || rawId?.split(":").at(-1)?.replace(/_/g, " ");
    if (name && !labels.includes(name)) labels.push(name);
  }
  return labels.slice(0, 8);
}

export function blurbFromEntity(entity: QlooEntity): string {
  const props = entity.properties ?? {};
  const shortFromList =
    Array.isArray(props.short_descriptions) &&
    props.short_descriptions.find(
      (item) =>
        item &&
        typeof item === "object" &&
        "language" in item &&
        (item as { language?: string }).language === "en" &&
        "value" in item &&
        typeof (item as { value?: unknown }).value === "string",
    );
  const shortEn =
    shortFromList && typeof shortFromList === "object" && "value" in shortFromList
      ? String((shortFromList as { value: string }).value)
      : null;
  const fromProps =
    (typeof props.short_description === "string" && props.short_description) ||
    shortEn ||
    (typeof props.description === "string" && props.description) ||
    (typeof props.synopsis === "string" && props.synopsis);
  if (fromProps) return fromProps.slice(0, 180);
  if (entity.short_description) return entity.short_description.slice(0, 180);
  if (entity.description) return entity.description.slice(0, 180);
  if (entity.disambiguation) return entity.disambiguation.slice(0, 180);
  return `${entityNameOf(entity)} from Qloo taste data.`;
}

export function geoFromEntity(entity: QlooEntity): { lat: number; lng: number } | null {
  const loc = entity.location;
  if (loc) {
    const lat = loc.lat ?? loc.latitude;
    const lng = loc.lon ?? loc.longitude;
    if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  }
  const props = entity.properties ?? {};
  const lat = typeof props.lat === "number" ? props.lat : typeof props.latitude === "number" ? props.latitude : null;
  const lng =
    typeof props.lon === "number"
      ? props.lon
      : typeof props.lng === "number"
        ? props.lng
        : typeof props.longitude === "number"
          ? props.longitude
          : null;
  if (lat !== null && lng !== null) return { lat, lng };
  return null;
}

/** True when a place entity's `properties.is_closed` is explicitly `true`. Used to drop closed
 * places entirely from discover results (`toProviderEntity` returns `null` for them) — a
 * permanently-closed venue is never worth recommending, so it's dropped rather than kept with
 * an `is_closed` flag for the UI to filter later (see `VenueFacts`, which has no such field). */
export function isClosedPlace(entity: QlooEntity): boolean {
  return entity.properties?.is_closed === true;
}

/** Accepts only `http://`/`https://` URLs (anything else — a bare domain, `mailto:`, a
 * malformed string — is dropped rather than rendered as a clickable link). */
export function httpUrlOnly(url: unknown): string | undefined {
  if (typeof url !== "string" || url.trim().length === 0) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Extracts `VenueFacts` from a Qloo `place` entity's `location`/`properties`/`query.distance`.
 * Returns `undefined` when there's no usable coordinate (nothing to plot on a map). Does not
 * check `is_closed` itself — callers drop closed places earlier via `isClosedPlace` instead of
 * surfacing the flag here. */
export function venueFactsFromEntity(entity: QlooEntity): VenueFacts | undefined {
  const geo = geoFromEntity(entity);
  if (!geo) return undefined;
  const props = entity.properties ?? {};
  const address = typeof props.address === "string" && props.address.trim().length > 0 ? props.address : undefined;
  const neighbourhoodRaw =
    (typeof props.neighborhood === "string" && props.neighborhood) ||
    (typeof props.neighbourhood === "string" && props.neighbourhood) ||
    undefined;
  const neighbourhood = neighbourhoodRaw && neighbourhoodRaw.trim().length > 0 ? neighbourhoodRaw : undefined;
  const website = httpUrlOnly(props.website);
  const distanceRaw = entity.query?.distance;
  const distanceM = typeof distanceRaw === "number" && Number.isFinite(distanceRaw) ? Math.round(distanceRaw) : undefined;
  return { lat: geo.lat, lon: geo.lng, address, neighbourhood, website, distanceM };
}

/**
 * Reads Qloo's `feature.explainability=true` payload (`query.explainability["signal.interests.entities"]`,
 * an array of `{ entity_id, score }`) and maps the highest-scoring one back to a resolved
 * (matched) anchor's display name, so a candidate's evidence can honestly say "this came mostly
 * from your anchor X" instead of a generic affinity percentage. Returns `null` when there's no
 * explainability payload, or its top entity doesn't correspond to one of this run's matched
 * anchors (e.g. it points at a different entity Qloo considered along the way).
 */
export function explainabilityAnchor(
  entity: QlooEntity,
  resolved: ResolvedAnchor[],
): { anchorName: string; score: number } | null {
  const entries = entity.query?.explainability?.["signal.interests.entities"];
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const byId = new Map(
    resolved.filter((item) => item.status === "matched" && item.entityId).map((item) => [item.entityId as string, item.entityName ?? item.input]),
  );
  const top = [...entries]
    .filter((item): item is { entity_id?: string; score?: number } => Boolean(item))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (!top?.entity_id) return null;
  const anchorName = byId.get(top.entity_id);
  if (!anchorName) return null;
  return { anchorName, score: Math.max(0, Math.min(1, top.score ?? 0)) };
}

export function toProviderEntity(entity: QlooEntity, kind: PartnerKind, city?: string): ProviderEntity | null {
  if (isClosedPlace(entity)) return null;
  const id = entityIdOf(entity);
  if (!id) return null;
  const tagsList = tagLabelsFromEntity(entity);
  const tags: Record<string, number> = {};
  tagsList.forEach((label, index) => {
    tags[label.toLowerCase().replace(/\s+/g, "_")] = Math.max(0.35, 1 - index * 0.1);
  });
  const popularity = typeof entity.popularity === "number" ? entity.popularity : affinityOf(entity);
  const venueFacts = venueFactsFromEntity(entity);
  return {
    id,
    name: entityNameOf(entity),
    kind,
    entityType: entityTypeFromUrns(typesOf(entity)) || entityTypeForKind(kind),
    blurb: blurbFromEntity(entity),
    tags,
    audienceTags: tagsList.slice(0, 4).map((label) => label.toLowerCase().replace(/\s+/g, "_")),
    popularity: Math.max(0, Math.min(1, popularity)),
    trend: 0,
    city,
    neighbourhood: venueFacts?.neighbourhood,
    venueFacts,
  };
}

export function stretchScores(raw: number[], out?: { normalization?: Normalization }): number[] {
  if (raw.length === 0) return [];
  const normalization = computeNormalization(raw);
  if (out) out.normalization = normalization;
  return raw.map((value) => stretchWithNormalization(value, normalization));
}

export function surpriseFor(kind: PartnerKind, businessType: BusinessType, matchScore: number, median: number): {
  surprise: number;
  isSurprising: boolean;
} {
  const category = profileFor(businessType).category;
  const FD = new Set(["food", "drink"]);
  const MC = new Set(["music", "venue", "culture"]);
  const FR = new Set(["fashion", "retail"]);
  const FW = new Set(["fitness", "wellness"]);
  const sameGroup = (a: PartnerKind, b: PartnerKind) =>
    (FD.has(a) && FD.has(b)) || (MC.has(a) && MC.has(b)) || (FR.has(a) && FR.has(b)) || (FW.has(a) && FW.has(b));
  let surprise = 0.85;
  if (kind === category) surprise = 0;
  else if (sameGroup(kind, category)) surprise = 0.3;
  else if ((FD.has(category) && FR.has(kind)) || (FR.has(category) && FD.has(kind))) surprise = 0.55;
  else if ((FD.has(category) && FW.has(kind)) || (FW.has(category) && FD.has(kind))) surprise = 0.65;
  else if ((MC.has(category) && FR.has(kind)) || (FR.has(category) && MC.has(kind))) surprise = 0.7;
  const isSurprising = surprise >= 0.6 && matchScore >= median;
  return { surprise, isSurprising };
}

export function sharedTags(resolved: ResolvedAnchor[], entity: ProviderEntity): string[] {
  const anchorTags = new Set(resolved.flatMap((item) => item.tags.map((tag) => tag.toLowerCase())));
  const entityTags = Object.keys(entity.tags);
  const shared = entityTags.filter((tag) => anchorTags.has(tag) || anchorTags.has(tag.replace(/_/g, " ")));
  if (shared.length > 0) return shared.slice(0, 5).map(humanizeTag);
  return entityTags.slice(0, 3).map(humanizeTag);
}

function humanizeTag(tag: string): string {
  return tag.replace(/_/g, " ");
}

export function buildPartner(args: {
  entry: ProviderEntity;
  local: boolean;
  affinityTo: number;
  affinityFrom: number;
  matchScore: number;
  resolved: ResolvedAnchor[];
  input: BusinessInput;
  median: number;
  parentId?: string;
  expanded?: boolean;
}): Partner {
  const { entry, local, affinityTo, affinityFrom, matchScore, resolved, input, median, parentId, expanded } = args;
  const tags = sharedTags(resolved, entry);
  const { surprise, isSurprising } = surpriseFor(entry.kind, input.businessType, matchScore, median);
  const tagOverlap =
    tags.length === 0
      ? 0
      : Math.min(1, tags.length / Math.max(3, Object.keys(entry.tags).length || 3));
  const signals: SignalBreakdown = {
    affinityToPartner: affinityTo,
    affinityFromPartner: affinityFrom,
    tagOverlap,
    localPopularity: local ? Math.max(0.35, entry.popularity) : entry.popularity * 0.7,
    trend: Math.max(0, Math.min(1, (entry.trend + 0.3) / 0.7)),
  };
  const evidence: EvidenceItem[] = [
    {
      label: "Shared tags",
      value: tags.length > 0 ? tags.join(", ") : "Taste overlap from Qloo affinities",
      origin: tags.length > 0 ? "data" : "interpretation",
    },
    {
      label: "Affinity to partner",
      value: `${Math.round(affinityTo * 100)}% from your anchors toward ${entry.name}`,
      origin: "data",
    },
    {
      label: "Affinity from partner",
      value: `${Math.round(affinityFrom * 100)}% from ${entry.name} back toward your category`,
      origin: "data",
    },
    {
      label: "Local popularity",
      value: local ? "Appears in local place results for this city" : "Global brand or artist",
      origin: local ? "data" : "interpretation",
    },
    {
      label: "How Venn ranked it",
      value: "Relative match score among partners in this search, stretched to 52–96.",
      origin: "interpretation",
    },
  ];
  if (entry.explainabilityAnchorName) {
    evidence.push({
      label: "Explainability",
      value: `Qloo's explainability attributes this mostly to your anchor "${entry.explainabilityAnchorName}" (${Math.round(
        (entry.explainabilityScore ?? 0) * 100,
      )}%).`,
      origin: "data",
    });
  }
  const reasons = [
    tags.length > 0
      ? `Your customers and ${entry.name}'s audience both lean ${tags.slice(0, 2).join(" and ")}.`
      : `${entry.name} overlaps with the taste signal from your anchors.`,
    local
      ? "A local option, so a collab could happen nearby."
      : entry.kind === profileFor(input.businessType).category
        ? "Close to your industry, with a familiar crowd."
        : "A different industry, so you'd reach new people rather than your own regulars.",
  ].slice(0, 3);

  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    entityType: entry.entityType,
    blurb: entry.blurb,
    local,
    locationLabel: local ? entry.neighbourhood ?? entry.city : undefined,
    matchScore,
    surprise,
    isSurprising,
    reasons,
    sharedTags: tags,
    tags: Object.keys(entry.tags),
    signals,
    evidence,
    relatedIds: [],
    venueFacts: entry.venueFacts,
    parentId,
    expanded,
  };
}

export function attachRelatedByAffinity(partners: Partner[]): void {
  for (const partner of partners) {
    const peers = [...partners]
      .filter((other) => other.id !== partner.id)
      .sort((a, b) => {
        const aScore =
          a.signals.affinityToPartner * 0.5 + a.signals.tagOverlap * 0.3 + (a.kind === partner.kind ? 0.2 : 0);
        const bScore =
          b.signals.affinityToPartner * 0.5 + b.signals.tagOverlap * 0.3 + (b.kind === partner.kind ? 0.2 : 0);
        return bScore - aScore;
      })
      .slice(0, 3)
      .map((other) => other.id);
    partner.relatedIds = peers;
  }
}

export function cityInfoFromSearch(name: string, entity: QlooEntity | null): CityInfo | null {
  if (!entity) return null;
  const geo = geoFromEntity(entity);
  if (!geo) return null;
  return {
    name: entityNameOf(entity) || name.trim(),
    center: [geo.lat, geo.lng],
    zoom: 12,
    hasLocalData: true,
  };
}

export function heatmapSpotsFromQloo(
  points: Array<Record<string, unknown>>,
  city: CityInfo,
): import("@shared/types").HeatSpot[] {
  const spots: import("@shared/types").HeatSpot[] = [];
  for (const [index, point] of points.entries()) {
    const lat =
      typeof point.lat === "number"
        ? point.lat
        : typeof point.latitude === "number"
          ? point.latitude
          : Array.isArray(point.location) && typeof point.location[0] === "number"
            ? point.location[0]
            : null;
    const lng =
      typeof point.lon === "number"
        ? point.lon
        : typeof point.lng === "number"
          ? point.lng
          : typeof point.longitude === "number"
            ? point.longitude
            : Array.isArray(point.location) && typeof point.location[1] === "number"
              ? point.location[1]
              : null;
    if (lat === null || lng === null) continue;
    const intensity =
      typeof point.affinity === "number"
        ? point.affinity
        : typeof point.weight === "number"
          ? point.weight
          : typeof point.intensity === "number"
            ? point.intensity
            : 0.5;
    const name =
      (typeof point.name === "string" && point.name) ||
      (typeof point.neighbourhood === "string" && point.neighbourhood) ||
      `Hotspot ${index + 1}`;
    const id = typeof point.id === "string" ? point.id : `heat-${index}`;
    const clamped = Math.max(0.05, Math.min(1, intensity));
    spots.push({
      id,
      name,
      lat,
      lng,
      intensityA: clamped,
      intensityB: Math.max(0.05, clamped * 0.85),
      overlap: clamped,
      why: "Audience overlap density from Qloo heatmap insights.",
      rank: null,
    });
  }
  void city;
  spots.sort((a, b) => b.overlap - a.overlap);
  spots.forEach((spot, index) => {
    spot.rank = index < 3 ? index + 1 : null;
  });
  return spots;
}

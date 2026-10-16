import type { EntityType, Goals, Partner, ReachOption } from "@shared/types";

/**
 * Partners Venn should surface as collaboration targets: places you can visit, or brands
 * you can pitch — not media networks, magazines, playlists, or far-away venues.
 */

const MEDIA_NAME_RE =
  /\b(network|magazine|podcast|netflix|disney|spotify|youtube|bbc|cnn|nbc|cbs|mtv|timeout|tripadvisor|wikipedia|imdb|tiktok|instagram|facebook|twitter|x\.com)\b/i;

const MEDIA_PHRASE_RE =
  /\b(food network|food & wine|food and wine|food52|bon appétit|bon appetit|new york times|the guardian|rolling stone|pitchfork|billboard|vice media|condé nast|conde nast)\b/i;

const CONTENT_TITLE_RE =
  /\b(christmas|dinner party|playlist|mixtape|greatest hits|best of|volume \d|season \d|episode)\b/i;

/** Public parks / landmarks — fine for taste signal, not as outreach partners. */
const LANDMARK_RE =
  /\b(park|common|heath|gardens?|square|bridge|monument|memorial|statue|palace|castle|cathedral|zoo|aquarium|pier|quay)\b/i;

const NON_ACTIONABLE_TYPES = new Set<EntityType>(["tv_show", "movie", "podcast", "book", "destination"]);

export function looksLikeMediaOrContent(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (MEDIA_PHRASE_RE.test(trimmed)) return true;
  if (MEDIA_NAME_RE.test(trimmed)) return true;
  if (CONTENT_TITLE_RE.test(trimmed)) return true;
  return false;
}

export function looksLikePublicLandmark(name: string): boolean {
  return LANDMARK_RE.test(name.trim());
}

export function isActionableEntityType(entityType: EntityType, reach: ReachOption = "local_and_brands"): boolean {
  if (NON_ACTIONABLE_TYPES.has(entityType)) return false;
  if (entityType === "person") return false;
  if (entityType === "artist") return reach === "anywhere";
  return entityType === "place" || entityType === "brand";
}

export interface ActionableOptions {
  /** When the run has local geography, drop non-local places (e.g. Chicago club for a London café). */
  hasLocalGeography?: boolean;
  reach?: ReachOption;
  /** Soft floor: never return fewer than this many partners if raw had more. */
  floor?: number;
}

/**
 * True when a scored partner is a plausible collab target you can visit or email —
 * local place, contactable brand — not a media property or distant venue.
 */
export function isActionablePartner(partner: Partner, opts: ActionableOptions = {}): boolean {
  const reach = opts.reach ?? "local_and_brands";
  if (looksLikeMediaOrContent(partner.name)) return false;
  if (looksLikePublicLandmark(partner.name)) return false;
  if (!isActionableEntityType(partner.entityType, reach)) return false;

  if (partner.entityType === "place") {
    if (opts.hasLocalGeography && reach !== "anywhere" && !partner.local) return false;
    // Places without any locality when we asked for nearby are weak outreach targets.
    if (reach === "near" && !partner.local) return false;
  }

  if (partner.entityType === "brand" && reach === "near" && !partner.local) {
    // "Just nearby" should not fill with national media / global brand HQs.
    return false;
  }

  return true;
}

export interface ActionableFilterResult {
  partners: Partner[];
  removed: number;
  note?: string;
}

/**
 * Keeps reachable collab partners, re-ordering so local places lead. Protects a floor so the
 * map is never empty when the pool was thin.
 */
export function filterActionablePartners(
  partners: Partner[],
  goals: Goals | undefined,
  opts: ActionableOptions = {},
): ActionableFilterResult {
  const reach = goals?.reach ?? opts.reach ?? "local_and_brands";
  const floor = opts.floor ?? 4;
  const actionable = partners.filter((partner) =>
    isActionablePartner(partner, { ...opts, reach }),
  );

  if (actionable.length === 0) {
    // Fall back to demoting rather than emptying: drop only clear media/content names.
    const soft = partners.filter(
      (partner) => !looksLikeMediaOrContent(partner.name) && !looksLikePublicLandmark(partner.name),
    );
    const pool = soft.length > 0 ? soft : partners;
    return {
      partners: rankActionable(pool),
      removed: partners.length - pool.length,
      note:
        soft.length < partners.length
          ? `Left out ${partners.length - soft.length} media, parks, or content hits that aren't reachable partners.`
          : undefined,
    };
  }

  if (actionable.length < Math.min(floor, partners.length) && actionable.length < partners.length) {
    // Too few after hard filter — fill only with other still-reachable candidates (never media /
    // distant places when we have local geography).
    const keptIds = new Set(actionable.map((p) => p.id));
    const fillers = partners
      .filter((p) => !keptIds.has(p.id) && isActionablePartner(p, { ...opts, reach }))
      .slice(0, Math.max(0, floor - actionable.length));
    const merged = rankActionable([...actionable, ...fillers]);
    return {
      partners: merged,
      removed: partners.length - merged.length,
      note: `Prioritised ${merged.length} local places and brands you can reach out to.`,
    };
  }

  return {
    partners: rankActionable(actionable),
    removed: partners.length - actionable.length,
    note:
      actionable.length < partners.length
        ? `Kept ${actionable.length} reachable partners (places and brands you can visit or pitch); left out ${partners.length - actionable.length} media, distant, or hard-to-reach hits.`
        : undefined,
  };
}

/** Local places first, then other places, then brands — stable by matchScore within tier. */
function rankActionable(partners: Partner[]): Partner[] {
  const tier = (partner: Partner): number => {
    if (partner.entityType === "place" && partner.local) return 0;
    if (partner.entityType === "place") return 1;
    if (partner.entityType === "brand" && partner.local) return 2;
    if (partner.entityType === "brand") return 3;
    return 4;
  };
  return [...partners].sort(
    (a, b) => tier(a) - tier(b) || b.matchScore - a.matchScore || a.name.localeCompare(b.name),
  );
}

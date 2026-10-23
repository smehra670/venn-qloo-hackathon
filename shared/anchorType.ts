import type { EntityType } from "./types.js";

const ENTITY_TYPES = new Set<string>(["brand", "place", "artist", "person", "podcast", "tv_show", "movie", "book", "destination"]);

/**
 * A taste anchor's `type` in the short form the typed resolver uses ("brand", "artist", "topic"…).
 * Accepts Qloo's long form too ("urn:entity:brand", "tag"), so every anchor, typed or swiped,
 * new or restored from storage, sends and resolves the same way.
 */
export function shortAnchorType(type: string): string {
  const short = type.trim().replace(/^urn:entity:/, "");
  return short === "tag" ? "topic" : short;
}

/** The anchor's entity type for ranking, or undefined when it is not a known entity type. */
export function anchorEntityType(type: string): EntityType | undefined {
  const short = shortAnchorType(type);
  return ENTITY_TYPES.has(short) ? (short as EntityType) : undefined;
}

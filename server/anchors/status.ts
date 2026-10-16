import type { AnchorStatus } from "@shared/types";

/** Generic words that rarely change Qloo rankings on their own. */
export const BROAD_ANCHOR_WORDS = [
  "food",
  "drink",
  "music",
  "art",
  "fashion",
  "shopping",
  "fitness",
  "lifestyle",
  "culture",
  "entertainment",
  "health",
  "travel",
] as const;

export const ENTITY_AUTO_FLOOR = 0.85;
export const CANDIDATE_FLOOR = 0.6;
export const TOPIC_CLEAR_FLOOR = 0.85;
export const TOPIC_AMBIGUOUS_GAP = 0.08;

export function normaliseAnchorText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ");
}

/** Dice / bigram coefficient — good for short names; 1 = identical. */
export function nameSimilarity(a: string, b: string): number {
  const left = normaliseAnchorText(a);
  const right = normaliseAnchorText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return Math.max(0.7, shorter / longer);
  }
  const bigrams = (value: string): Map<string, number> => {
    const map = new Map<string, number>();
    const padded = ` ${value} `;
    for (let i = 0; i < padded.length - 1; i += 1) {
      const gram = padded.slice(i, i + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  };
  const A = bigrams(left);
  const B = bigrams(right);
  let overlap = 0;
  for (const [gram, count] of A) {
    overlap += Math.min(count, B.get(gram) ?? 0);
  }
  const total = [...A.values()].reduce((s, n) => s + n, 0) + [...B.values()].reduce((s, n) => s + n, 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

export function isBroadAnchorWord(input: string): boolean {
  const normalised = normaliseAnchorText(input);
  return (BROAD_ANCHOR_WORDS as readonly string[]).includes(normalised);
}

export interface ClassifyTasteAnchorInput {
  normalisedInput: string;
  entityScores: number[];
  topicScores: number[];
  /** When a tag signal overlaps the no-signal baseline by ≥ 0.8, treat as too_broad. */
  tagSignalOverlap?: number;
}

/**
 * Pure status rules for dual entity/tag resolve.
 * Never recommends candidates below CANDIDATE_FLOOR (callers must filter first).
 */
export function classifyTasteAnchorStatus(input: ClassifyTasteAnchorInput): AnchorStatus {
  if (isBroadAnchorWord(input.normalisedInput)) return "too_broad";
  if (typeof input.tagSignalOverlap === "number" && input.tagSignalOverlap >= 0.8) return "too_broad";

  const entities = [...input.entityScores].sort((a, b) => b - a);
  const topics = [...input.topicScores].sort((a, b) => b - a);
  const topEntity = entities[0];
  const secondEntity = entities[1];
  const topTopic = topics[0];
  const secondTopic = topics[1];

  if (topEntity !== undefined && topEntity >= ENTITY_AUTO_FLOOR) {
    if (secondEntity === undefined || topEntity - secondEntity >= 0.12) return "entity";
    return "ambiguous";
  }

  if (topTopic !== undefined && topTopic >= TOPIC_CLEAR_FLOOR) {
    if (secondTopic !== undefined && topTopic - secondTopic < TOPIC_AMBIGUOUS_GAP) return "ambiguous";
    if (topEntity !== undefined && topEntity >= CANDIDATE_FLOOR) return "ambiguous";
    return "topic";
  }

  const hasPlausible =
    (topEntity !== undefined && topEntity >= CANDIDATE_FLOOR) ||
    (topTopic !== undefined && topTopic >= CANDIDATE_FLOOR);
  if (hasPlausible) return "ambiguous";
  return "unresolved";
}

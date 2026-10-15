import type { AnchorCandidate, AnchorResolution, AnchorStatus } from "@shared/types";
import Fuse from "fuse.js";
import { CATALOG, type CatalogEntry } from "../providers/mock/catalog.js";

interface FuseRow {
  id: string;
  name: string;
  aliases: string[];
}

const fuse = new Fuse<FuseRow>(
  CATALOG.map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases ?? [] })),
  { keys: ["name", "aliases"], threshold: 0.45, ignoreLocation: true, includeScore: true, minMatchCharLength: 2 },
);

function byId(id: string): CatalogEntry | undefined {
  return CATALOG.find((item) => item.id === id);
}

/** Converts a fuse.js distance score (0 = perfect match, 1 = worst) into a 0-1 similarity
 * score (1 = perfect) — the shape `classifyAnchorStatus` and the UI expect. */
function similarity(fuseScore: number | undefined): number {
  return Math.max(0, 1 - (fuseScore ?? 1));
}

function isExactMatch(entry: CatalogEntry, query: string): boolean {
  return entry.name.toLowerCase() === query || Boolean(entry.aliases?.some((alias) => alias.toLowerCase() === query));
}

/**
 * Pure status function: decides "auto" / "ambiguous" / "unresolved" purely from a list of
 * candidate similarity scores (any order) — no I/O, no catalog lookups — so it's trivial to
 * unit test against made-up numbers as well as real fixtures.
 *
 * - "unresolved": nothing plausible at all (or no candidates).
 * - "auto": one confident winner (score >= 0.82), clear of any runner-up (gap >= 0.12 —
 *   anything closer is treated as a real ambiguity, including an exact tie between two
 *   same-named entities, e.g. "Aesop" the skincare brand vs "Aesop" the storyteller).
 * - "ambiguous": everything else — a plausible top candidate (>= 0.35) that either isn't
 *   confident enough on its own, or is too close to a runner-up to pick automatically.
 */
export function classifyAnchorStatus(scores: number[]): AnchorStatus {
  const sorted = [...scores].sort((a, b) => b - a);
  const top = sorted[0];
  const second = sorted[1];
  if (top === undefined || top < 0.35) return "unresolved";
  if (top >= 0.82 && (second === undefined || top - second >= 0.12)) return "auto";
  return "ambiguous";
}

function candidatesFor(input: string): AnchorCandidate[] {
  const query = input.trim().toLowerCase();
  if (!query) return [];
  const hits = fuse.search(query, { limit: 6 });
  const found = new Map<string, AnchorCandidate>();
  for (const hit of hits) {
    const entry = byId(hit.item.id);
    if (!entry) continue;
    const score = isExactMatch(entry, query) ? 1 : similarity(hit.score);
    found.set(entry.id, { entityId: entry.id, entityName: entry.name, entityType: entry.entityType, score });
  }
  // Fuse's threshold can exclude a short exact match it otherwise considers "too different" in
  // length from the query; make sure every exact name/alias match is always included.
  for (const entry of CATALOG) {
    if (found.has(entry.id)) continue;
    if (isExactMatch(entry, query)) {
      found.set(entry.id, { entityId: entry.id, entityName: entry.name, entityType: entry.entityType, score: 1 });
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score || a.entityName.localeCompare(b.entityName));
}

/**
 * Resolves a batch of free-text anchors to candidates + a status, for the "Check your anchors"
 * confirm step. Mock/demo-dataset only today — a live Qloo-backed version would call
 * `/search` per anchor and feed the same scores into `classifyAnchorStatus`.
 */
export function resolveAnchorsForConfirm(anchors: string[]): AnchorResolution[] {
  return anchors.map((input) => {
    const candidates = candidatesFor(input);
    const status = classifyAnchorStatus(candidates.map((candidate) => candidate.score));
    return { input, status, candidates: status === "auto" ? candidates.slice(0, 1) : candidates.slice(0, 4) };
  });
}

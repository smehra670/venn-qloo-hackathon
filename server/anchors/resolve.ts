import type {
  AnchorResolution,
  AiAnchorSuggestion,
  BusinessType,
  TasteAnchor,
  TasteAnchorCandidate,
} from "@shared/types";
import { config } from "../config.js";
import { CATALOG } from "../providers/mock/catalog.js";
import { searchEntities, searchTags } from "../providers/qloo/client.js";
import { searchTypesForAnchor } from "../providers/qloo/mapping.js";
import { TAG_FIXTURES } from "./tags.js";
import { suggestAnchorsWithAi } from "./suggest.js";
import {
  CANDIDATE_FLOOR,
  ENTITY_AUTO_FLOOR,
  classifyTasteAnchorStatus,
  nameSimilarity,
  normaliseAnchorText,
} from "./status.js";

export { classifyTasteAnchorStatus, nameSimilarity, normaliseAnchorText, isBroadAnchorWord } from "./status.js";

/** @deprecated Use classifyTasteAnchorStatus. Kept for older tests that mapped auto≈entity. */
export function classifyAnchorStatus(scores: number[]): "auto" | "ambiguous" | "unresolved" {
  const sorted = [...scores].sort((a, b) => b - a);
  const top = sorted[0];
  const second = sorted[1];
  if (top === undefined || top < 0.35) return "unresolved";
  if (top >= 0.82 && (second === undefined || top - second >= 0.12)) return "auto";
  return "ambiguous";
}

const resolveCache = new Map<string, { at: number; value: AnchorResolution[] }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ResolveAnchorsOptions {
  city?: string;
  businessType?: BusinessType;
  goal?: string;
  skipAi?: boolean;
  mode?: "mock" | "qloo";
}

function cacheKey(anchors: string[], opts: ResolveAnchorsOptions): string {
  return JSON.stringify({
    anchors: anchors.map(normaliseAnchorText),
    city: opts.city ?? "",
    businessType: opts.businessType ?? "",
    mode: opts.mode ?? config.tasteProvider,
    skipAi: Boolean(opts.skipAi),
  });
}

function filterFloor(candidates: TasteAnchorCandidate[]): TasteAnchorCandidate[] {
  return candidates.filter((item) => item.score >= CANDIDATE_FLOOR).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function dedupeTopicsByName(candidates: TasteAnchorCandidate[]): TasteAnchorCandidate[] {
  const best = new Map<string, TasteAnchorCandidate>();
  for (const item of candidates) {
    const key = normaliseAnchorText(item.name);
    const prev = best.get(key);
    if (!prev || item.score > prev.score) best.set(key, item);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

function mockEntityCandidates(input: string): TasteAnchorCandidate[] {
  const needle = normaliseAnchorText(input);
  const out: TasteAnchorCandidate[] = [];
  for (const entry of CATALOG) {
    const names = [entry.name, ...(entry.aliases ?? [])];
    let score = 0;
    for (const name of names) {
      score = Math.max(score, nameSimilarity(needle, name));
    }
    if (score >= CANDIDATE_FLOOR) {
      out.push({
        id: entry.id,
        name: entry.name,
        kind: "entity",
        type: entry.entityType,
        score,
      });
    }
  }
  return filterFloor(out).slice(0, 6);
}

function mockTopicCandidates(input: string): TasteAnchorCandidate[] {
  const needle = normaliseAnchorText(input);
  const out: TasteAnchorCandidate[] = [];
  for (const tag of TAG_FIXTURES) {
    const names = [tag.name, ...(tag.aliases ?? [])];
    let score = 0;
    for (const name of names) {
      score = Math.max(score, nameSimilarity(needle, name));
    }
    if (score >= CANDIDATE_FLOOR) {
      out.push({ id: tag.id, name: tag.name, kind: "tag", type: "topic", score });
    }
  }
  return dedupeTopicsByName(filterFloor(out));
}

async function liveEntityCandidates(input: string, signal?: AbortSignal): Promise<TasteAnchorCandidate[]> {
  const results = await searchEntities(
    {
      query: input,
      types: searchTypesForAnchor(),
      take: 8,
    },
    signal,
  );
  const out: TasteAnchorCandidate[] = [];
  for (const item of results) {
    const id = String(item.entity_id ?? item.id ?? "");
    const name = String(item.name ?? "");
    if (!id || !name) continue;
    const score = nameSimilarity(input, name);
    if (score < CANDIDATE_FLOOR) continue;
    const types = Array.isArray(item.types) ? item.types : [];
    const type =
      types
        .map(String)
        .find((t) => t.includes("brand") || t.includes("artist") || t.includes("place") || t.includes("person"))
        ?.replace("urn:entity:", "") ?? "brand";
    out.push({ id, name, kind: "entity", type, score });
  }
  return filterFloor(out).slice(0, 6);
}

async function liveTopicCandidates(input: string, signal?: AbortSignal): Promise<TasteAnchorCandidate[]> {
  const tags = await searchTags(input, signal, { semantic: true });
  const out: TasteAnchorCandidate[] = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    kind: "tag" as const,
    type: "topic",
    score: nameSimilarity(input, tag.name),
  }));
  return dedupeTopicsByName(filterFloor(out));
}

function toSelected(candidate: TasteAnchorCandidate, origin: TasteAnchor["origin"] = "qloo"): TasteAnchor {
  return {
    name: candidate.name,
    kind: candidate.kind,
    id: candidate.id,
    type: candidate.type,
    origin,
  };
}

function buildResolution(
  input: string,
  entityCandidates: TasteAnchorCandidate[],
  topicCandidates: TasteAnchorCandidate[],
): AnchorResolution {
  const status = classifyTasteAnchorStatus({
    normalisedInput: normaliseAnchorText(input),
    entityScores: entityCandidates.map((c) => c.score),
    topicScores: topicCandidates.map((c) => c.score),
  });

  let selected: TasteAnchor | undefined;
  if (status === "entity" && entityCandidates[0] && entityCandidates[0].score >= ENTITY_AUTO_FLOOR) {
    selected = toSelected(entityCandidates[0]);
  } else if (status === "topic" && topicCandidates[0]) {
    selected = toSelected(topicCandidates[0]);
  }

  const candidates = [...entityCandidates, ...topicCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    input,
    status,
    entityCandidates: entityCandidates.slice(0, 4),
    topicCandidates: topicCandidates.slice(0, 4),
    candidates,
    selected,
  };
}

async function resolveOne(input: string, mode: "mock" | "qloo", signal?: AbortSignal): Promise<AnchorResolution> {
  if (mode === "qloo" && config.qlooApiKey) {
    // At most 2 Qloo calls per anchor.
    const entityCandidates = await liveEntityCandidates(input, signal);
    const topEntity = entityCandidates[0];
    if (topEntity && topEntity.score >= ENTITY_AUTO_FLOOR) {
      const second = entityCandidates[1];
      if (!second || topEntity.score - second.score >= 0.12) {
        return buildResolution(input, entityCandidates, []);
      }
    }
    const topicCandidates = await liveTopicCandidates(input, signal);
    return buildResolution(input, entityCandidates, topicCandidates);
  }
  const entityCandidates = mockEntityCandidates(input);
  const topicCandidates = mockTopicCandidates(input);
  return buildResolution(input, entityCandidates, topicCandidates);
}

/**
 * Dual entity/tag resolve for setup chips. Uses live Qloo when TASTE_PROVIDER=qloo and a key
 * is present; otherwise mock catalog + tag fixtures. Optionally runs AI suggestions for
 * too_broad / unresolved anchors (verified on Qloo / mock).
 */
export async function resolveAnchorsForConfirm(
  anchors: string[],
  opts: ResolveAnchorsOptions = {},
): Promise<AnchorResolution[]> {
  const mode: "mock" | "qloo" =
    opts.mode ?? (config.tasteProvider === "qloo" && config.qlooApiKey ? "qloo" : "mock");
  const key = cacheKey(anchors, { ...opts, mode });
  const cached = resolveCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const results: AnchorResolution[] = [];
  for (const anchor of anchors) {
    results.push(await resolveOne(anchor, mode));
  }

  const needsAi = results.filter((item) => item.status === "too_broad" || item.status === "unresolved");
  if (!opts.skipAi && needsAi.length > 0) {
    try {
      const suggestions = await suggestAnchorsWithAi({
        anchors: needsAi,
        businessType: opts.businessType ?? "other",
        city: opts.city ?? "",
        goal: opts.goal,
        mode,
      });
      for (const item of results) {
        const pack = suggestions.get(normaliseAnchorText(item.input));
        if (!pack) continue;
        item.aiSuggestions = pack.suggestions;
        item.note = pack.note || item.note;
        item.verdict = pack.verdict ?? item.verdict;
      }
    } catch {
      // Silent skip — Qloo candidates already on the resolution.
    }
  }

  resolveCache.set(key, { at: Date.now(), value: results });
  return results;
}

/** Apply a verified AI suggestion as the chip's selected taste anchor. */
export function suggestionToTasteAnchor(suggestion: AiAnchorSuggestion): TasteAnchor | null {
  if (!suggestion.verified) return null;
  return { ...suggestion.verified, origin: "ai_suggested" };
}

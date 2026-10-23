import type {
  DiscoverSpec,
  PartnerKind,
  ProofCallLog,
  ProofItem,
  ProofKindGroup,
  ProofResult,
  ProofSummary,
  RankEntry,
  RunResult,
} from "@shared/types";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { getLlm } from "./llm/index.js";
import type { LlmClient } from "./llm/types.js";
import { getProvider } from "./providers/index.js";
import type { ProviderContext, TasteProvider } from "./providers/types.js";

/** How many kind-groups a single Proof build compares, independent of the Qloo call budget —
 * keeps the view readable even on a search that searched many kinds. */
const MAX_KINDS = 4;
/** Venn items shown per kind: the top pick(s) for that kind, not the whole shortlist. */
const VENN_ITEMS_PER_KIND = 2;

const STANDARD_CAVEAT =
  "Scores on this page come from ranking each kind together with its baseline in one call, and describe group-level taste patterns for this search — not individual customers or guarantees.";

function isLlmOn(llm: LlmClient): boolean {
  return llm.provider === "openai" || llm.provider === "fake";
}

/** Kinds to compare, most-promising first: every distinct kind among Venn's own (non
 * user-added) partners, ordered by that kind's best match score. */
function orderedKinds(result: RunResult): PartnerKind[] {
  const discovered = [...result.partners]
    .filter((partner) => !partner.userAdded)
    .sort((a, b) => b.matchScore - a.matchScore);
  const seen: PartnerKind[] = [];
  for (const partner of discovered) {
    if (!seen.includes(partner.kind)) seen.push(partner.kind);
  }
  return seen;
}

/** Merges multiple discover calls for the same kind (e.g. the "adapt" widen pass) into one
 * spec per kind, keeping the first call's params as the shape `rankTogether` replays. */
function specsByKind(result: RunResult): Map<PartnerKind, DiscoverSpec> {
  const map = new Map<PartnerKind, DiscoverSpec>();
  for (const spec of result.discoverSpecs ?? []) {
    const existing = map.get(spec.kind);
    if (!existing) {
      map.set(spec.kind, spec);
      continue;
    }
    const poolIds = [...new Set([...existing.poolIds, ...spec.poolIds])];
    map.set(spec.kind, { ...existing, poolIds });
  }
  return map;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Resolves a free-text "obvious baseline" name to an entity id via the provider's existing
 * search/resolve path (`checkPartner`). Only the resolved id/name are used — the frozen
 * matchScore `checkPartner` computes is discarded in favour of a same-call rankTogether score. */
async function resolveBaselineId(
  provider: TasteProvider,
  result: RunResult,
  name: string,
  kind: PartnerKind,
  ctx: ProviderContext,
): Promise<{ id: string; name: string } | null> {
  try {
    const partner = await provider.checkPartner(
      result.input,
      result.resolvedAnchors,
      { name, entityHint: kind },
      { normalization: result.normalization ?? { minRaw: 0, maxRaw: 1 }, medianScore: 74 },
      ctx,
    );
    if (!partner) return null;
    return { id: partner.id, name: partner.name };
  } catch {
    return null;
  }
}

interface BudgetState {
  remaining: number;
}

async function buildKindGroup(
  kind: PartnerKind,
  result: RunResult,
  spec: DiscoverSpec,
  provider: TasteProvider,
  ctx: ProviderContext,
  llmOn: boolean,
  baselineName: string | undefined,
  budget: BudgetState,
  calls: ProofCallLog[],
  caveats: Set<string>,
): Promise<ProofKindGroup> {
  const vennPartners = [...result.partners]
    .filter((partner) => !partner.userAdded && partner.kind === kind)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, VENN_ITEMS_PER_KIND);

  let extraIds: string[] = [];
  let baselineLabel: { id: string; name: string } | undefined;
  if (llmOn && baselineName) {
    if (budget.remaining > 1) {
      budget.remaining -= 1;
      const resolved = await resolveBaselineId(provider, result, baselineName, kind, ctx);
      if (resolved) {
        baselineLabel = resolved;
        extraIds = [resolved.id];
      } else {
        caveats.add(`Couldn't resolve an AI-suggested baseline name for ${kind} ("${baselineName}") via search.`);
      }
    } else {
      caveats.add(`Skipped resolving an AI baseline name for ${kind} to stay within the call budget.`);
    }
  }

  budget.remaining -= 1;
  const callId = nanoid(8);
  let ranked: RankEntry[] = [];
  try {
    ranked = await provider.rankTogether(spec, extraIds, ctx);
  } catch {
    caveats.add(`Couldn't rank ${kind} together with a baseline this time.`);
  }
  calls.push({ callId, kind, poolSize: spec.poolIds.length });

  const rankById = new Map(ranked.map((entry) => [entry.entityId, entry] as const));
  const nameById = new Map<string, string>(result.partners.map((partner) => [partner.id, partner.name]));
  if (baselineLabel) nameById.set(baselineLabel.id, baselineLabel.name);

  const toItem = (id: string): ProofItem | null => {
    const entry = rankById.get(id);
    if (!entry) return null;
    const affinity = Math.max(0, Math.min(1, entry.affinity));
    return {
      entityId: id,
      // Prefer a name Venn already knows for this id, then the provider's own name for it
      // (covers a baseline pick that isn't one of Venn's own partners) — the raw id is a last
      // resort, not something to show as a label.
      name: nameById.get(id) ?? entry.name ?? id,
      score: Math.round(affinity * 100),
      rawAffinity: entry.affinity,
      popularity: entry.popularity,
    };
  };

  const vennItems = vennPartners.map((partner) => toItem(partner.id)).filter((item): item is ProofItem => item !== null);

  let baselineItems: ProofItem[] = [];
  if (baselineLabel) {
    const item = toItem(baselineLabel.id);
    if (item) baselineItems = [item];
  } else {
    // Popularity baseline: the most popular pooled id that isn't already one of Venn's own
    // picks for this kind, read straight from the same rankTogether response.
    const vennIds = new Set(vennPartners.map((partner) => partner.id));
    const byPopularity = [...ranked].filter((entry) => !vennIds.has(entry.entityId)).sort((a, b) => b.popularity - a.popularity);
    const top = byPopularity[0];
    if (top) {
      const item = toItem(top.entityId);
      if (item) baselineItems = [item];
    }
  }

  if (vennItems.length === 0 && baselineItems.length === 0) {
    caveats.add(`No comparable scores came back for ${kind} this time.`);
  }

  return { kind, callId, poolSize: spec.poolIds.length, vennItems, baselineItems };
}

function summarize(perKind: ProofKindGroup[]): ProofSummary {
  const vennScores: number[] = [];
  const baselineScores: number[] = [];
  let vennWins = 0;
  let baselineWins = 0;
  let ties = 0;
  let kindsCompared = 0;

  for (const group of perKind) {
    const hasVenn = group.vennItems.length > 0;
    const hasBaseline = group.baselineItems.length > 0;
    if (!hasVenn && !hasBaseline) continue;
    kindsCompared += 1;
    const vennAvg = average(group.vennItems.map((item) => item.score));
    const baselineAvg = average(group.baselineItems.map((item) => item.score));
    if (hasVenn) vennScores.push(vennAvg);
    if (hasBaseline) baselineScores.push(baselineAvg);
    if (hasVenn && hasBaseline) {
      const delta = vennAvg - baselineAvg;
      if (Math.abs(delta) < 1) ties += 1;
      else if (delta > 0) vennWins += 1;
      else baselineWins += 1;
    }
  }

  const avgVennScore = average(vennScores);
  const avgBaselineScore = average(baselineScores);
  return {
    kindsCompared,
    avgVennScore: Math.round(avgVennScore),
    avgBaselineScore: Math.round(avgBaselineScore),
    avgDelta: Math.round(avgVennScore - avgBaselineScore),
    vennWins,
    baselineWins,
    ties,
  };
}

function fallbackNarrative(summary: ProofSummary): string {
  if (summary.kindsCompared === 0) {
    return "Not enough ranked-together data yet to compare Venn's picks against a baseline for this search.";
  }
  return `Ranking each kind together with an "obvious" baseline in one call, Venn's picks averaged ${summary.avgVennScore}/100 vs ${summary.avgBaselineScore}/100 for the baseline across ${summary.kindsCompared} kind${summary.kindsCompared === 1 ? "" : "s"}.`;
}

async function buildNarrative(
  llm: LlmClient,
  llmOn: boolean,
  result: RunResult,
  perKind: ProofKindGroup[],
  summary: ProofSummary,
): Promise<string> {
  const fallback = fallbackNarrative(summary);
  if (!llmOn || summary.kindsCompared === 0) return fallback;
  try {
    const lines = perKind
      .filter((group) => group.vennItems.length > 0 || group.baselineItems.length > 0)
      .map((group) => {
        const venn = group.vennItems.map((item) => `${item.name} ${item.score}`).join(", ") || "no score";
        const baseline = group.baselineItems.map((item) => `${item.name} ${item.score}`).join(", ") || "no score";
        return `${group.kind}: Venn ${venn} vs baseline ${baseline}`;
      })
      .join("\n");
    const response = await llm.completeJson<{ narrative?: string }>({
      system:
        "You are Venn's proof narrator. In 2 short plain-English sentences, explain how Venn's taste-ranked picks compare to the 'obvious' baseline for this search, naming at least one specific partner and its score. No markdown, no fluff.",
      user: `Business: ${result.input.businessType} in ${result.input.city}. Anchors: ${result.input.anchors.join(", ")}.\n\n${lines}`,
      schema: {
        name: "proof_narrative",
        schema: {
          type: "object",
          properties: { narrative: { type: "string" } },
          required: ["narrative"],
          additionalProperties: false,
        },
      },
    });
    const text = response?.narrative;
    if (typeof text === "string" && text.trim().length > 0) return text.trim();
  } catch {
    // Keep the deterministic fallback; the row data itself never depends on the LLM.
  }
  return fallback;
}

/** Asks the LLM for one "obvious, non-taste-informed" baseline name per kind being compared —
 * what a marketer might guess without any affinity data. Best-effort: a failed/empty response
 * just means every kind falls back to the popularity baseline instead. */
async function suggestBaselineNames(llm: LlmClient, result: RunResult, kinds: PartnerKind[]): Promise<Record<string, string>> {
  if (kinds.length === 0) return {};
  try {
    const response = await llm.completeJson<{ suggestions?: Record<string, string> }>({
      system:
        "You suggest the 'obvious' naive partner pick a marketer might choose for a category without any taste-affinity data — just a well-known, widely recognised brand, artist or place for that category. Reply JSON only, one short name per requested category key.",
      user: `Business: ${result.input.businessType} in ${result.input.city}. Categories: ${kinds.join(", ")}.`,
      schema: {
        name: "proof_baseline_suggestions",
        schema: {
          type: "object",
          properties: {
            suggestions: { type: "object", additionalProperties: { type: "string" } },
          },
          required: ["suggestions"],
          additionalProperties: false,
        },
      },
    });
    return response?.suggestions ?? {};
  } catch {
    return {};
  }
}

/**
 * Builds the Proof payload: for each of the top kinds Venn searched, ranks Venn's own pick(s)
 * together with an "obvious" baseline in one `rankTogether` call, so every score shown comes
 * from the same call and is directly comparable (see `docs/SCORING.md`). The baseline is an
 * AI-suggested well-known name (resolved via search) when an LLM is configured, otherwise the
 * most popular item already in the same discover pool. Bounded by `config.proofMaxCalls`;
 * kinds without a recorded `DiscoverSpec` (legacy runs, or providers that can't replay one)
 * are shown without scores instead of guessed numbers.
 */
export async function buildProof(
  result: RunResult,
  ctx: ProviderContext,
  deps: { provider?: TasteProvider; llm?: LlmClient } = {},
): Promise<ProofResult> {
  const provider = deps.provider ?? getProvider({ live: result.provider === "qloo" });
  const llm = deps.llm ?? getLlm();
  const llmOn = isLlmOn(llm);
  const legacy = !result.discoverSpecs || result.discoverSpecs.length === 0;

  const kinds = orderedKinds(result).slice(0, MAX_KINDS);
  const specs = specsByKind(result);
  const caveats = new Set<string>([STANDARD_CAVEAT]);
  const calls: ProofCallLog[] = [];
  const budget: BudgetState = { remaining: Math.max(1, config.proofMaxCalls) };

  const baselineNames = llmOn ? await suggestBaselineNames(llm, result, kinds) : {};

  const perKind: ProofKindGroup[] = [];
  const legacyKinds: PartnerKind[] = [];
  for (const kind of kinds) {
    const spec = specs.get(kind);
    if (!spec || spec.poolIds.length === 0) {
      legacyKinds.push(kind);
      perKind.push({
        kind,
        poolSize: 0,
        vennItems: [],
        baselineItems: [],
        note: "No discover call was recorded for this kind, so it can't be ranked together with a baseline.",
      });
      continue;
    }
    if (budget.remaining <= 0) {
      caveats.add(`Stopped comparing further kinds to stay within this proof's call budget (${config.proofMaxCalls} calls).`);
      perKind.push({
        kind,
        poolSize: spec.poolIds.length,
        vennItems: [],
        baselineItems: [],
        note: "Skipped: call budget reached.",
      });
      continue;
    }
    perKind.push(await buildKindGroup(kind, result, spec, provider, ctx, llmOn, baselineNames[kind], budget, calls, caveats));
  }

  if (legacyKinds.length > 0) {
    caveats.add(
      legacy
        ? "This search predates Venn's rank-together Proof, so there's nothing to rank together yet — only the standard disclaimer applies."
        : `${legacyKinds.join(", ")} had no recorded discover call this run, so Proof can't rank ${legacyKinds.length === 1 ? "it" : "them"} against a baseline.`,
    );
  }

  const summary = summarize(perKind);
  const narrative = await buildNarrative(llm, llmOn, result, perKind, summary);

  return {
    runId: result.runId,
    baseline: llmOn ? "ai" : "popularity",
    narrative,
    perKind,
    summary,
    caveats: [...caveats],
    calls,
    legacy,
  };
}

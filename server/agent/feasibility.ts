import type { BusinessInput, DecisionOrigin, FeasibilityLevel, Partner, TopPick } from "@shared/types";
import { FEASIBILITY_LEVELS } from "@shared/types";
import { config } from "../config.js";
import { getLlm, type LlmClient } from "../llm/index.js";
import { looksLikeMediaOrContent } from "./reachable.js";
import { profileFor } from "../providers/mock/profiles.js";
import { SCORE_MIN } from "../providers/scoring.js";

function levelIndex(level: FeasibilityLevel): number {
  return FEASIBILITY_LEVELS.indexOf(level);
}

/** Clamps a suggested level to at most one step away from `from` on the easy -> warm_intro ->
 * long_shot ladder, so a critic (rule or LLM) can nudge a feasibility read but never flip it
 * wholesale (e.g. straight from easy to long_shot). */
export function clampOneStep(from: FeasibilityLevel, suggested: FeasibilityLevel): FeasibilityLevel {
  const fromIdx = levelIndex(from);
  const suggestedIdx = levelIndex(suggested);
  const diff = Math.max(-1, Math.min(1, suggestedIdx - fromIdx));
  return FEASIBILITY_LEVELS[fromIdx + diff] ?? from;
}

export interface FeasibilityAssessment {
  level: FeasibilityLevel;
  reason: string;
}

/**
 * Rule-based outreach-readiness tier for one top-pick partner. Never a veto — even a
 * "long_shot" partner stays in the run; the UI just surfaces the tier before anyone reaches
 * out. Checks run in order of severity: the first one that applies wins.
 */
export function assessFeasibility(partner: Partner, input: BusinessInput): FeasibilityAssessment {
  const category = profileFor(input.businessType).category;

  if (looksLikeMediaOrContent(partner.name) || partner.entityType === "tv_show" || partner.entityType === "movie") {
    return {
      level: "long_shot",
      reason: `${partner.name} looks like media or content rather than a place or brand you can walk into or email for a collab.`,
    };
  }
  if (partner.kind === category) {
    return {
      level: "long_shot",
      reason: `${partner.name} is in the same category as your business (${category}), so this reads more like a competitor than a cross-promotion partner.`,
    };
  }
  if (partner.entityType === "place" && !partner.local) {
    return {
      level: "warm_intro",
      reason: `${partner.name} isn't marked as local to your city — confirm you can actually visit or meet before pitching an in-person collab.`,
    };
  }
  if (partner.sharedTags.length === 0 && partner.matchScore <= SCORE_MIN + 4) {
    return {
      level: "long_shot",
      reason: `No strong shared tags back this match for ${partner.name}, and its match score sits near the bottom of this search's range — treat it as exploratory at best.`,
    };
  }
  if (partner.sharedTags.length === 0) {
    return {
      level: "warm_intro",
      reason: `No strong shared tags back this match for ${partner.name} yet — worth a short exploratory chat rather than a confident pitch.`,
    };
  }
  if (partner.local && !partner.locationLabel) {
    return {
      level: "warm_intro",
      reason: `${partner.name} is flagged local but has no specific neighbourhood on file — confirm a real-world location before planning anything in person.`,
    };
  }
  if (partner.matchScore <= SCORE_MIN + 4) {
    return {
      level: "warm_intro",
      reason: `${partner.name}'s match score sits near the bottom of this search's range — a weaker fit than the other top picks.`,
    };
  }
  return {
    level: "easy",
    reason: `Strong shared tags and a solid match score make ${partner.name} a natural first outreach.`,
  };
}

/** Attaches a rule-based `feasibility` (origin "rule") to the partners that are in `topPicks`
 * only, leaving the rest untouched. Returns the same array (new objects for the top picks) so
 * the runner can reassign `partners` unconditionally. */
export function applyFeasibility(partners: Partner[], topPicks: TopPick[], input: BusinessInput): Partner[] {
  if (topPicks.length === 0) return partners;
  const pickedIds = new Set(topPicks.map((pick) => pick.partnerId));
  return partners.map((partner) =>
    pickedIds.has(partner.id)
      ? { ...partner, feasibility: { ...assessFeasibility(partner, input), origin: "rule" as DecisionOrigin } }
      : partner,
  );
}

/** The partners among `topPicks` whose feasibility tier is worse than "easy". */
export function flaggedPartners(partners: Partner[], topPicks: TopPick[]): Partner[] {
  const pickedIds = new Set(topPicks.map((pick) => pick.partnerId));
  return partners.filter((partner) => pickedIds.has(partner.id) && partner.feasibility && partner.feasibility.level !== "easy");
}

const CRITIC_SCHEMA = {
  name: "feasibility_critique",
  schema: {
    type: "object",
    properties: {
      critiques: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            level: { type: "string", enum: [...FEASIBILITY_LEVELS] },
            reason: { type: "string" },
          },
          required: ["name", "level", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["critiques"],
    additionalProperties: false,
  },
};

export interface FeasibilityCritique {
  partnerId: string;
  level: FeasibilityLevel;
  reason: string;
}

/**
 * Optional short LLM critique of the rule-based feasibility tiers above, written with the fast
 * model when an LLM is configured. The prompt instructs the model to use only the facts handed
 * to it — it must never invent match scores, popularity, or other Qloo-shaped numbers that
 * aren't already in the input — and may only nudge a tier by one step (enforced again here via
 * `clampOneStep`, regardless of what the model actually suggests). Returns `[]` (no network
 * call) when no LLM is configured, or there is nothing flagged to critique.
 */
export async function critiqueFeasibility(flagged: Partner[], llm: LlmClient = getLlm()): Promise<FeasibilityCritique[]> {
  if (flagged.length === 0 || llm.provider === "none") return [];
  const facts = flagged.map((partner) => ({
    name: partner.name,
    kind: partner.kind,
    ruleLevel: partner.feasibility?.level ?? "warm_intro",
    reason: partner.feasibility?.reason ?? "",
  }));
  const system =
    "You are a terse business-collaboration critic. Use ONLY the facts given to you — never invent match " +
    "scores, popularity figures, or any other data point that is not already in the input. For each partner, " +
    "either agree with its ruleLevel or nudge it by exactly one step on the easy / warm_intro / long_shot " +
    "ladder if the facts clearly support it. Reply with one short, plain-English reason per partner.";
  const user = `Rule-based feasibility already computed for the flagged top picks:\n${JSON.stringify(facts, null, 2)}\n\nWrite the critique now.`;
  try {
    const response = await llm.completeJson<{ critiques?: { name: string; level: string; reason: string }[] }>({
      system,
      user,
      schema: CRITIC_SCHEMA,
      model: config.llmModelFast,
    });
    const byName = new Map(flagged.map((partner) => [partner.name, partner]));
    const out: FeasibilityCritique[] = [];
    for (const item of response?.critiques ?? []) {
      const partner = byName.get(item.name);
      if (!partner?.feasibility) continue;
      const suggested = (FEASIBILITY_LEVELS as readonly string[]).includes(item.level)
        ? (item.level as FeasibilityLevel)
        : partner.feasibility.level;
      const level = clampOneStep(partner.feasibility.level, suggested);
      const reason = item.reason?.trim();
      if (!reason) continue;
      out.push({ partnerId: partner.id, level, reason });
    }
    return out;
  } catch {
    return [];
  }
}

/** Applies critic suggestions on top of the rule-based tiers, marking their origin "ai".
 * Partners with no matching critique keep their rule-based feasibility untouched. */
export function applyCritiques(partners: Partner[], critiques: FeasibilityCritique[]): Partner[] {
  if (critiques.length === 0) return partners;
  const byId = new Map(critiques.map((critique) => [critique.partnerId, critique]));
  return partners.map((partner) => {
    const critique = byId.get(partner.id);
    if (!critique) return partner;
    return { ...partner, feasibility: { level: critique.level, reason: critique.reason, origin: "ai" as DecisionOrigin } };
  });
}

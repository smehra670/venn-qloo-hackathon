import type { BusinessInput, Partner, TopPick } from "@shared/types";
import { config } from "../config.js";
import { getLlm, type LlmClient } from "../llm/index.js";
import { profileFor } from "../providers/mock/profiles.js";
import { SCORE_MIN } from "../providers/scoring.js";

/**
 * Rule-based sanity checks for one top-pick partner. `ok: false` is a caveat, not a veto —
 * the partner stays in the run, but the UI surfaces the note before anyone reaches out.
 */
export function assessFeasibility(partner: Partner, input: BusinessInput): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  let ok = true;
  const category = profileFor(input.businessType).category;

  if (partner.kind === category) {
    ok = false;
    notes.push(
      `${partner.name} is in the same category as your business (${category}), so this reads more like a competitor than a cross-promotion partner.`,
    );
  }

  if (partner.sharedTags.length === 0) {
    ok = false;
    notes.push(
      `No strong shared tags back this match for ${partner.name} — the overlap is thin. Treat it as exploratory rather than a safe bet.`,
    );
  }

  if (partner.local && !partner.locationLabel) {
    notes.push(
      `${partner.name} is flagged local but has no specific neighbourhood on file — confirm a real-world location before planning anything in person.`,
    );
  }

  if (partner.matchScore <= SCORE_MIN + 4) {
    notes.push(
      `${partner.name}'s match score sits near the bottom of this search's range — a weaker fit than the other top picks.`,
    );
  }

  return { ok, notes };
}

/** Attaches `feasibility` to the partners that are in `topPicks` only, leaving the rest
 * untouched. Returns the same array (new objects for the top picks) so the runner can
 * reassign `partners` unconditionally. */
export function applyFeasibility(partners: Partner[], topPicks: TopPick[], input: BusinessInput): Partner[] {
  if (topPicks.length === 0) return partners;
  const pickedIds = new Set(topPicks.map((pick) => pick.partnerId));
  return partners.map((partner) => (pickedIds.has(partner.id) ? { ...partner, feasibility: assessFeasibility(partner, input) } : partner));
}

/** The partners among `topPicks` whose rule-based feasibility check came back `ok: false`. */
export function flaggedPartners(partners: Partner[], topPicks: TopPick[]): Partner[] {
  const pickedIds = new Set(topPicks.map((pick) => pick.partnerId));
  return partners.filter((partner) => pickedIds.has(partner.id) && partner.feasibility && !partner.feasibility.ok);
}

const CRITIC_SCHEMA = {
  name: "feasibility_critique",
  schema: {
    type: "object",
    properties: { critique: { type: "string" } },
    required: ["critique"],
    additionalProperties: false,
  },
};

/**
 * Optional short LLM critique of the rule-based feasibility notes above, written with the
 * fast model when an LLM is configured. The prompt instructs the model to use only the
 * facts handed to it — it must never invent match scores, popularity, or other Qloo-shaped
 * numbers that are not already in `flagged`. Returns `null` (no network call) when no LLM is
 * configured, or there is nothing flagged to critique.
 */
export async function critiqueFeasibility(flagged: Partner[], llm: LlmClient = getLlm()): Promise<string | null> {
  if (flagged.length === 0 || llm.provider === "none") return null;
  const facts = flagged.map((partner) => ({
    name: partner.name,
    kind: partner.kind,
    notes: partner.feasibility?.notes ?? [],
  }));
  const system =
    "You are a terse business-collaboration critic. Use ONLY the facts given to you — never invent match " +
    "scores, popularity figures, or any other data point that is not already in the input. Reply with at " +
    "most two short, plain-English sentences a small business owner would find useful before reaching out.";
  const user = `Rule-based feasibility notes already computed for the flagged top picks:\n${JSON.stringify(facts, null, 2)}\n\nWrite the critique now.`;
  try {
    const response = await llm.completeJson<{ critique?: string }>({
      system,
      user,
      schema: CRITIC_SCHEMA,
      model: config.llmModelFast,
    });
    const text = response?.critique?.trim();
    return text ? text : null;
  } catch {
    return null;
  }
}

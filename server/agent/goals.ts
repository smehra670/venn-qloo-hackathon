import type { Goals, Partner, TopPick } from "@shared/types";
import { clamp } from "../utils/text.js";

/** True when at least one fine-tune preference was actually set. */
export function hasAnyGoal(goals: Goals | undefined): goals is Goals {
  if (!goals) return false;
  return (
    goals.preferLocal !== undefined ||
    goals.preferSurprising !== undefined ||
    goals.budget !== undefined ||
    (goals.avoidKinds !== undefined && goals.avoidKinds.length > 0) ||
    (goals.notes !== undefined && goals.notes.trim().length > 0)
  );
}

/** One short, human sentence describing the active fine-tune preferences, for the decision log. */
export function summarizeGoals(goals: Goals): string {
  const bits: string[] = [];
  if (goals.preferLocal) bits.push("prefer local partners");
  if (goals.preferSurprising) bits.push("prefer surprising wildcards");
  if (goals.budget) bits.push(`a ${goals.budget} budget feel`);
  if (goals.avoidKinds && goals.avoidKinds.length > 0) bits.push(`avoid ${goals.avoidKinds.join(", ")}`);
  if (goals.notes) bits.push(`a note: "${goals.notes}"`);
  if (bits.length === 0) return "No fine-tune preferences were set for this search.";
  return `You asked Venn to ${bits.join("; ")}.`;
}

/**
 * Budget "feel" is a rule-based proxy, not a real price: it leans on how widely known /
 * locally dense a partner already is (`signals.localPopularity`) as a stand-in for the scale
 * of a likely collaboration. "low" rewards smaller, less-saturated partners; "medium" rewards
 * a middling scale; "flexible" is neutral and never penalises a partner.
 */
function budgetFit(partner: Partner, budget: NonNullable<Goals["budget"]>): number {
  const scale = clamp(partner.signals.localPopularity, 0, 1);
  if (budget === "flexible") return 0.6;
  if (budget === "low") return clamp(1 - scale, 0, 1) * 0.6 + 0.3;
  return clamp(1 - Math.abs(scale - 0.55) * 1.4, 0, 1) * 0.6 + 0.3;
}

/**
 * Rule-based 0-1 fit between one partner and the run's optional fine-tune goals. Never reads
 * or influences `matchScore` — it only informs `goalFit`, which the runner uses for display
 * ordering/tiebreaks, never for the match score itself. Returns 0.5 (neutral) when no goals
 * are set, matching an "on average" fit.
 */
export function computeGoalFit(partner: Partner, goals: Goals | undefined): number {
  if (!hasAnyGoal(goals)) return 0.5;
  if (goals.avoidKinds?.includes(partner.kind)) return 0;

  const parts: number[] = [];
  if (goals.preferLocal !== undefined) {
    parts.push(goals.preferLocal ? (partner.local ? 1 : 0.3) : partner.local ? 0.5 : 0.6);
  }
  if (goals.preferSurprising !== undefined) {
    parts.push(
      goals.preferSurprising
        ? partner.isSurprising
          ? 1
          : 0.3 + partner.surprise * 0.3
        : partner.isSurprising
          ? 0.35
          : 0.6,
    );
  }
  if (goals.budget) parts.push(budgetFit(partner, goals.budget));
  if (parts.length === 0) return 0.5;
  const average = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return Math.round(clamp(average, 0, 1) * 100) / 100;
}

/** Attaches `goalFit` to every partner. Returns the same array (new objects) when no goals
 * are set, so the runner can call this unconditionally. */
export function applyGoals(partners: Partner[], goals: Goals | undefined): Partner[] {
  if (!hasAnyGoal(goals)) return partners;
  return partners.map((partner) => ({ ...partner, goalFit: computeGoalFit(partner, goals) }));
}

export interface GoalRerankResult {
  topPicks: TopPick[];
  /** One sentence per swap, suitable for the decision log. Empty when nothing changed. */
  notes: string[];
}

const ROLE_LABEL: Record<TopPick["role"], string> = {
  best_overall: "best overall pick",
  best_local: "best local fit",
  wildcard: "wildcard",
};

/**
 * Display-only re-rank of `topPicks`: within a small match-score tolerance of the current
 * pick for a role, swaps in a close competitor with a clearly stronger `goalFit`. Never
 * changes any partner's `matchScore`, and leaves `best_overall` untouched so the headline
 * pick always tracks the strongest raw overlap.
 */
export function rerankTopPicks(partners: Partner[], topPicks: TopPick[], goals: Goals | undefined, tolerance = 4): GoalRerankResult {
  if (!hasAnyGoal(goals) || topPicks.length === 0) return { topPicks, notes: [] };
  const byId = new Map(partners.map((partner) => [partner.id, partner]));
  const pickedIds = new Set(topPicks.map((pick) => pick.partnerId));
  const notes: string[] = [];

  const nextPicks = topPicks.map((pick) => {
    if (pick.role === "best_overall") return pick;
    const current = byId.get(pick.partnerId);
    if (!current) return pick;
    const currentFit = current.goalFit ?? 0.5;
    const replacement = partners
      .filter(
        (partner) =>
          !pickedIds.has(partner.id) &&
          current.matchScore - partner.matchScore <= tolerance &&
          (partner.goalFit ?? 0.5) >= currentFit + 0.2,
      )
      .sort((a, b) => (b.goalFit ?? 0) - (a.goalFit ?? 0) || b.matchScore - a.matchScore)[0];
    if (!replacement) return pick;
    pickedIds.delete(pick.partnerId);
    pickedIds.add(replacement.id);
    notes.push(
      `Swapped the ${ROLE_LABEL[pick.role]} from ${current.name} to ${replacement.name} — a close match score (${replacement.matchScore} vs ${current.matchScore}) with a better fit to your fine-tune preferences.`,
    );
    return { ...pick, partnerId: replacement.id };
  });

  return { topPicks: nextPicks, notes };
}

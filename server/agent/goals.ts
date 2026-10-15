import { APPETITE_LABELS, GOAL_LABELS, REACH_LABELS } from "@shared/constants";
import type { AppetiteOption, GoalId, Goals, Partner, PartnerKind, ReachOption, TopPick } from "@shared/types";
import { clamp } from "../utils/text.js";

const DEFAULT_REACH: ReachOption = "local_and_brands";
const DEFAULT_APPETITE: AppetiteOption = "medium";

/** True when at least one fine-tune preference differs from the "no opinion" default. */
export function hasAnyGoal(goals: Goals | undefined): goals is Goals {
  if (!goals) return false;
  return (
    (goals.wants?.length ?? 0) > 0 ||
    (goals.reach !== undefined && goals.reach !== DEFAULT_REACH) ||
    (goals.appetite !== undefined && goals.appetite !== DEFAULT_APPETITE) ||
    (goals.avoid?.length ?? 0) > 0
  );
}

/** One short, human sentence describing the active fine-tune preferences, for the decision log. */
export function summarizeGoals(goals: Goals): string {
  const bits: string[] = [];
  if (goals.wants.length > 0) {
    bits.push(goals.wants.map((id) => GOAL_LABELS[id].toLowerCase()).join(" and "));
  }
  if (goals.reach && goals.reach !== DEFAULT_REACH) {
    bits.push(`looking ${REACH_LABELS[goals.reach].toLowerCase()}`);
  }
  if (goals.appetite && goals.appetite !== DEFAULT_APPETITE) {
    bits.push(`a ${APPETITE_LABELS[goals.appetite].toLowerCase()} appetite`);
  }
  if (goals.avoid.length > 0) bits.push(`to avoid ${goals.avoid.join(", ")}`);
  if (bits.length === 0) return "No fine-tune preferences were set for this search.";
  return `You told Venn you're after ${bits.join("; ")}.`;
}

/**
 * Static affinity table between each `GoalId` and the `PartnerKind`s most likely to deliver
 * it. Used by `computeGoalFit` (display-only ranking) and `applyGoalsToKinds` (search order),
 * never by scoring. Kinds missing from a goal's row fall back to `NEUTRAL_KIND_AFFINITY`.
 */
const GOAL_KIND_AFFINITY: Record<GoalId, Partial<Record<PartnerKind, number>>> = {
  footfall: { venue: 0.95, food: 0.85, drink: 0.85, retail: 0.75, fitness: 0.6 },
  new_audience: { music: 0.9, culture: 0.85, fashion: 0.8, venue: 0.7 },
  content: { culture: 0.9, fashion: 0.85, music: 0.8, retail: 0.6 },
  events: { venue: 0.95, music: 0.9, culture: 0.75, drink: 0.6 },
  bundles: { retail: 0.9, food: 0.85, drink: 0.8, fashion: 0.75 },
  shared_costs: { retail: 0.8, fitness: 0.75, wellness: 0.75, venue: 0.6 },
  stockists: { retail: 0.95, food: 0.8, drink: 0.75, fashion: 0.8 },
};
const NEUTRAL_KIND_AFFINITY = 0.45;

function wantsFit(kind: PartnerKind, wants: GoalId[]): number {
  if (wants.length === 0) return 0.5;
  const scores = wants.map((want) => GOAL_KIND_AFFINITY[want]?.[kind] ?? NEUTRAL_KIND_AFFINITY);
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function reachFit(partner: Partner, reach: ReachOption): number {
  if (reach === "near") return partner.local ? 1 : 0.25;
  if (reach === "anywhere") return partner.local ? 0.35 : 0.9;
  return 0.6;
}

/**
 * Appetite "size" is a rule-based proxy, not a real price: it leans on how widely known /
 * locally dense a partner already is (`signals.localPopularity`) as a stand-in for the scale
 * of a likely collaboration. "light" rewards smaller, less-saturated partners; "ambitious"
 * rewards bigger, more established ones; "medium" is neutral either way.
 */
function appetiteFit(partner: Partner, appetite: AppetiteOption): number {
  const scale = clamp(partner.signals.localPopularity, 0, 1);
  if (appetite === "light") return clamp(1 - scale, 0, 1) * 0.6 + 0.3;
  if (appetite === "ambitious") return clamp(scale, 0, 1) * 0.6 + 0.3;
  return clamp(1 - Math.abs(scale - 0.55) * 1.4, 0, 1) * 0.6 + 0.3;
}

/** Loose match between a free-text `avoid` entry and a `PartnerKind`: exact id, or a
 * substring either way (so "fitness" or "gyms" both catch the `fitness` kind). */
function avoidsKindName(kind: PartnerKind, avoid: string[]): boolean {
  const lower = kind.toLowerCase();
  return avoid.some((item) => {
    const needle = item.trim().toLowerCase();
    return needle.length > 0 && (needle === lower || lower.includes(needle) || needle.includes(lower));
  });
}

/**
 * Rule-based 0-1 fit between one partner and the run's optional fine-tune goals, built from the
 * `GOAL_KIND_AFFINITY` table plus `reach`/`appetite`. Never reads or influences `matchScore` —
 * it only informs `goalFit`, which the runner uses for display ordering/tiebreaks. Returns 0.5
 * (neutral) when no goals are set, matching an "on average" fit.
 */
export function computeGoalFit(partner: Partner, goals: Goals | undefined): number {
  if (!hasAnyGoal(goals)) return 0.5;
  if (avoidsKindName(partner.kind, goals.avoid)) return 0;
  const parts = [wantsFit(partner.kind, goals.wants), reachFit(partner, goals.reach), appetiteFit(partner, goals.appetite)];
  const average = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return Math.round(clamp(average, 0, 1) * 100) / 100;
}

/** Attaches `goalFit` to every partner. Returns the same array (new objects) when no goals
 * are set, so the runner can call this unconditionally. */
export function applyGoals(partners: Partner[], goals: Goals | undefined): Partner[] {
  if (!hasAnyGoal(goals)) return partners;
  return partners.map((partner) => ({ ...partner, goalFit: computeGoalFit(partner, goals) }));
}

/**
 * Reorders `kinds` so types that best match the business's `wants` are searched first, and
 * drops any kind named in `avoid` — unless that would empty the list, in which case the
 * original order is kept so the search always has something to look for.
 */
export function applyGoalsToKinds(kinds: PartnerKind[], goals: Goals | undefined): PartnerKind[] {
  if (!hasAnyGoal(goals)) return kinds;
  const filtered = kinds.filter((kind) => !avoidsKindName(kind, goals.avoid));
  const base = filtered.length > 0 ? filtered : kinds;
  if (goals.wants.length === 0) return base;
  return [...base].sort((a, b) => wantsFit(b, goals.wants) - wantsFit(a, goals.wants));
}

export interface GoalFilterResult {
  partners: Partner[];
  /** One sentence describing what was filtered out, for the decision log. Absent when
   * nothing was filtered (including when the filter was skipped to protect a floor). */
  note?: string;
}

/**
 * Hard-filters the scored pool by `avoid` (drops matching kinds outright) and, if that still
 * leaves a reasonable shortlist, by `reach` (keeps only local partners for "near", only brands
 * for "anywhere"). Never drops the pool below `floor` partners — in that case the filter is
 * skipped for that step so the map still has something to show.
 */
export function filterByGoals(partners: Partner[], goals: Goals | undefined, floor = 6): GoalFilterResult {
  if (!hasAnyGoal(goals)) return { partners };
  let next = partners;
  let note: string | undefined;

  if (goals.avoid.length > 0) {
    const withoutAvoided = partners.filter((partner) => !avoidsKindName(partner.kind, goals.avoid));
    if (withoutAvoided.length >= Math.min(floor, partners.length) && withoutAvoided.length < partners.length) {
      note = `Left out ${partners.length - withoutAvoided.length} partner(s) matching what you asked Venn to avoid.`;
      next = withoutAvoided;
    }
  }

  if (goals.reach !== "local_and_brands") {
    const wantLocal = goals.reach === "near";
    const reachFiltered = next.filter((partner) => partner.local === wantLocal);
    if (reachFiltered.length >= Math.min(floor, next.length) && reachFiltered.length < next.length) {
      next = reachFiltered;
    }
  }

  return { partners: next, note };
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

import { GOAL_LABELS } from "@shared/constants";
import type { Goals, Partner } from "@shared/types";

/** Short label for the drawer chip explaining why a partner does (or doesn't) fit the
 * business's stated goals. Returns `null` when there's nothing worth a chip for (no goals, no
 * `wants`, or a fit too close to neutral to be worth calling out). */
export function goalFitLabel(partner: Partner, goals: Goals | undefined): string | null {
  if (!goals || goals.wants.length === 0 || typeof partner.goalFit !== "number") return null;
  const label = goals.wants.map((id) => GOAL_LABELS[id]).join(" & ");
  if (partner.goalFit >= 0.7) return `Good fit for ${label}`;
  if (partner.goalFit <= 0.25) return `Weak fit for ${label}`;
  return null;
}

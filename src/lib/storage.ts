import { BusinessInputSchema } from "@shared/schemas";
import type { AppetiteOption, BusinessInput, GoalId, Goals, ReachOption, TasteAnchor } from "@shared/types";

const INPUT_KEY = "venn:input";
const RUN_KEY = "venn:runId";

const BUDGET_TO_APPETITE: Record<string, AppetiteOption> = { low: "light", medium: "medium", flexible: "ambitious" };

/**
 * Maps the pre-GoalId `Goals` shape (`preferLocal`/`preferSurprising`/`budget`/`avoidKinds`/
 * `notes`) that may still be sitting in a user's `localStorage` onto the current shape, so an
 * old saved search still loads instead of silently dropping its fine-tune preferences. A no-op
 * for anything that already looks like the current shape.
 */
function migrateGoals(raw: unknown): Goals | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const isCurrentShape = "wants" in value || "reach" in value || "appetite" in value || "avoid" in value;
  if (isCurrentShape) return value as unknown as Goals;

  const wants: GoalId[] = [];
  if (value.preferSurprising === true) wants.push("new_audience");
  const reach: ReachOption = value.preferLocal === true ? "near" : "local_and_brands";
  const appetite: AppetiteOption =
    typeof value.budget === "string" && value.budget in BUDGET_TO_APPETITE ? BUDGET_TO_APPETITE[value.budget]! : "medium";
  const avoid = Array.isArray(value.avoidKinds) ? value.avoidKinds.filter((item): item is string => typeof item === "string") : [];
  return { wants: wants.slice(0, 2), reach, appetite, avoid };
}

export function readInput(): BusinessInput | null {
  try {
    const raw = localStorage.getItem(INPUT_KEY);
    if (!raw) return null;
    const json: unknown = JSON.parse(raw);
    if (json && typeof json === "object" && "goals" in json) {
      (json as Record<string, unknown>).goals = migrateGoals((json as Record<string, unknown>).goals);
    }
    const parsed = BusinessInputSchema.safeParse(json);
    if (!parsed.success) return null;
    // The run schema strips `via`; keep it so swiped chips restore looking the same.
    const rawAnchors = (json as { tasteAnchors?: Array<{ id?: unknown; via?: unknown }> }).tasteAnchors ?? [];
    const tasteAnchors = parsed.data.tasteAnchors?.map((anchor): TasteAnchor => {
      const via = rawAnchors.find((raw) => raw?.id === anchor.id)?.via;
      return via === "swipe" || via === "typed" || via === "ai" ? { ...anchor, via } : anchor;
    });
    return tasteAnchors ? { ...parsed.data, tasteAnchors } : parsed.data;
  } catch {
    return null;
  }
}

export function saveInput(input: BusinessInput): void {
  try {
    localStorage.setItem(INPUT_KEY, JSON.stringify(input));
  } catch {
    // Private mode and full disks should not block the search.
  }
}

export function readRunId(): string | null {
  try {
    return sessionStorage.getItem(RUN_KEY);
  } catch {
    return null;
  }
}

export function saveRunId(runId: string): void {
  try {
    sessionStorage.setItem(RUN_KEY, runId);
  } catch {
    // The run still works for this page view.
  }
}

export function clearRunId(): void {
  try {
    sessionStorage.removeItem(RUN_KEY);
  } catch {
    // Ignore storage failures.
  }
}

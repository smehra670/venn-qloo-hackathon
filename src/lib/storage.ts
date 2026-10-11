import { BusinessInputSchema } from "@shared/schemas";
import type { BusinessInput } from "@shared/types";

const INPUT_KEY = "venn:input";
const RUN_KEY = "venn:runId";

export function readInput(): BusinessInput | null {
  try {
    const raw = localStorage.getItem(INPUT_KEY);
    if (!raw) return null;
    const parsed = BusinessInputSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
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

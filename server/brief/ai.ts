import type { Brief, BriefLength, BriefTone, Partner, RunResult } from "@shared/types";
import { config } from "../config.js";
import { getLlm, type LlmClient, type LlmCompletionRequest } from "../llm/index.js";
import { buildFactPack } from "./facts.js";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt, LLM_BRIEF_JSON_SCHEMA } from "./prompt.js";
import { renderBrief } from "./template.js";
import { toBrief, validateLlmPayload } from "./validate.js";

export interface WriteBriefOptions {
  variant: number;
  tone?: BriefTone;
  length?: BriefLength;
  /** Overrides config.llmBriefBudgetPerRun; mainly for tests. */
  budgetLimit?: number;
}

// How many AI briefs a single run has written so far. In-memory only: runs are ephemeral
// and this never needs to survive a restart.
const spent = new Map<string, number>();

function spentCount(runId: string): number {
  return spent.get(runId) ?? 0;
}

function spend(runId: string): void {
  spent.set(runId, spentCount(runId) + 1);
}

/** How many AI briefs this run can still write under the given (or configured) budget. */
export function briefBudgetRemaining(runId: string, limit = config.llmBriefBudgetPerRun): number {
  return Math.max(0, limit - spentCount(runId));
}

/**
 * Writes a brief with the LLM when one is configured and the run still has budget;
 * otherwise falls back to the deterministic template. Any LLM failure, invalid JSON, or an
 * evidence citation that cannot be traced back to the fact pack also falls back to the
 * template rather than showing something unverifiable.
 */
export async function writeAiBrief(
  result: RunResult,
  partner: Partner,
  opts: WriteBriefOptions,
  llm: LlmClient = getLlm(),
): Promise<Brief> {
  const tone = opts.tone ?? "warm";
  const length = opts.length ?? "standard";
  const variant = opts.variant;
  const limit = opts.budgetLimit ?? config.llmBriefBudgetPerRun;

  if (llm.provider === "none" || limit <= 0) {
    return renderBrief(result, partner, variant);
  }
  if (spentCount(result.runId) >= limit) {
    return renderBrief(result, partner, variant);
  }

  const factPack = buildFactPack(result, partner, variant);
  const system = buildSystemPrompt({ tone, length });
  const user = buildUserPrompt(factPack, { tone, length });
  // The actual model id used for the call — recorded on the brief so the UI can attribute
  // it (e.g. "AI · gpt-4.1-mini") rather than just "AI".
  const model = config.llmModel;
  const request: LlmCompletionRequest = { system, user, schema: LLM_BRIEF_JSON_SCHEMA, model };

  spend(result.runId);
  try {
    const raw = await llm.completeJson<unknown>(request);
    let outcome = validateLlmPayload(raw, factPack);
    if (!outcome.ok) {
      const repaired = llm.critic
        ? await llm.critic<unknown>(request, raw, outcome.issues)
        : await llm.completeJson<unknown>({ ...request, user: buildRepairPrompt(user, raw, outcome.issues) });
      outcome = validateLlmPayload(repaired, factPack);
    }
    if (!outcome.ok) return renderBrief(result, partner, variant);
    return toBrief(outcome.value, factPack, result, partner, variant, tone, length, model);
  } catch {
    return renderBrief(result, partner, variant);
  }
}

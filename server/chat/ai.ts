import type { ChatTurn, RunResult } from "@shared/types";
import { config } from "../config.js";
import { getLlm, isLlmEnabled, type LlmClient } from "../llm/index.js";
import { buildChatFactPack } from "./facts.js";
import { buildChatRepairPrompt, buildChatSystemPrompt, buildChatUserPrompt, CHAT_JSON_SCHEMA } from "./prompt.js";
import { validateChatPayload } from "./validate.js";

export type AskVennResult =
  | { ok: true; turn: ChatTurn; remaining: number }
  | { ok: false; reason: "disabled" | "budget" | "error" };

// How many chat replies a run has spent so far. In-memory only, same as the brief budget —
// runs are ephemeral and this never needs to survive a restart.
const spent = new Map<string, number>();

function spentCount(runId: string): number {
  return spent.get(runId) ?? 0;
}

export function chatBudgetRemaining(runId: string, limit = config.llmChatBudgetPerRun): number {
  return Math.max(0, limit - spentCount(runId));
}

/**
 * Answers one chat question about a finished run, grounded in that run's own evidence (see
 * `server/chat/facts.ts`). Mirrors the brief writer's shape — system prompt never sees
 * user-supplied text directly, one repair attempt on an invalid reply, capped per run — but
 * there is no deterministic fallback: an open-ended question has no sensible template, so
 * chat is simply unavailable without an LLM rather than faking an answer.
 */
export async function askVenn(
  result: RunResult,
  history: ChatTurn[],
  question: string,
  opts: { budgetLimit?: number } = {},
  llm: LlmClient = getLlm(),
): Promise<AskVennResult> {
  if (!isLlmEnabled() || llm.provider === "none") return { ok: false, reason: "disabled" };
  const limit = opts.budgetLimit ?? config.llmChatBudgetPerRun;
  if (spentCount(result.runId) >= limit) return { ok: false, reason: "budget" };

  const factPack = buildChatFactPack(result);
  const system = buildChatSystemPrompt();
  // Only the last few turns: enough for a coherent follow-up without the prompt growing unbounded.
  const recentHistory = history.slice(-8);
  const user = buildChatUserPrompt(factPack, recentHistory, question);
  const request = { system, user, schema: CHAT_JSON_SCHEMA, model: config.llmModelFast };

  spent.set(result.runId, spentCount(result.runId) + 1);
  try {
    const raw = await llm.completeJson<unknown>(request);
    let outcome = validateChatPayload(raw, factPack);
    if (!outcome.ok) {
      const repaired = await llm.completeJson<unknown>({ ...request, user: buildChatRepairPrompt(user, raw, outcome.issues) });
      outcome = validateChatPayload(repaired, factPack);
    }
    if (!outcome.ok) return { ok: false, reason: "error" };
    return {
      ok: true,
      turn: { role: "assistant", content: outcome.value.reply, partnerIds: outcome.value.partnerIds },
      remaining: chatBudgetRemaining(result.runId, limit),
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

import { config } from "../config.js";
import { AnthropicLlmClient } from "./anthropic.js";
import { FakeLlmClient } from "./fake.js";
import { EmptyLlmClient, NoneLlmClient } from "./none.js";
import { OpenAiLlmClient } from "./openai.js";
import type { LlmClient } from "./types.js";

let cached: LlmClient | null = null;
let cachedProvider: string | null = null;
let cachedKey: string | undefined;

/**
 * Picks the LLM client for the current config. Cached until the provider or key changes.
 *
 * `config.ts` is the primary gate: it throws at boot when LLM_PROVIDER is openai/anthropic
 * without a matching key (outside NODE_ENV=test), so this almost never runs with a missing
 * key in practice. The checks below are a second line of defense — e.g. a test harness that
 * flips `config.llmProvider` without going through config.ts's own parse — so there is still
 * no silent fallback to a different provider or to "no LLM" when one was explicitly requested.
 */
export function getLlm(): LlmClient {
  if (cached && cachedProvider === config.llmProvider && cachedKey === config.llmApiKey) return cached;
  cachedProvider = config.llmProvider;
  cachedKey = config.llmApiKey;

  if (config.llmProvider === "openai") {
    if (!config.llmApiKey) {
      if (config.nodeEnv !== "test") {
        throw new Error("LLM_PROVIDER=openai requires OPENAI_API_KEY (or LLM_API_KEY) to be set.");
      }
      cached = new NoneLlmClient();
    } else {
      cached = new OpenAiLlmClient(config.llmApiKey);
    }
  } else if (config.llmProvider === "anthropic") {
    if (!config.llmApiKey) {
      if (config.nodeEnv !== "test") {
        throw new Error("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY (or LLM_API_KEY) to be set.");
      }
      cached = new NoneLlmClient();
    } else {
      cached = new AnthropicLlmClient(config.llmApiKey);
    }
  } else if (config.llmProvider === "fake") {
    cached = new FakeLlmClient();
  } else if (config.llmProvider === "empty") {
    cached = new EmptyLlmClient();
  } else {
    cached = new NoneLlmClient();
  }
  return cached;
}

/** Mirrors the health route's definition of "AI briefs are live". */
export function isLlmEnabled(): boolean {
  return (
    ((config.llmProvider === "openai" || config.llmProvider === "anthropic") && Boolean(config.llmApiKey)) ||
    config.llmProvider === "fake"
  );
}

export type { LlmClient, LlmCompletionRequest, LlmJsonSchema, LlmProviderName } from "./types.js";

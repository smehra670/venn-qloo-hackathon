import { config } from "../config.js";
import { FakeLlmClient } from "./fake.js";
import { EmptyLlmClient, NoneLlmClient } from "./none.js";
import { OpenAiLlmClient } from "./openai.js";
import type { LlmClient } from "./types.js";

let cached: LlmClient | null = null;
let cachedProvider: string | null = null;
let cachedKey: string | undefined;

/** Picks the LLM client for the current config. Cached until the provider or key changes. */
export function getLlm(): LlmClient {
  if (cached && cachedProvider === config.llmProvider && cachedKey === config.llmApiKey) return cached;
  cachedProvider = config.llmProvider;
  cachedKey = config.llmApiKey;

  if (config.llmProvider === "openai" && config.llmApiKey) {
    cached = new OpenAiLlmClient(config.llmApiKey);
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
  return (config.llmProvider === "openai" && Boolean(config.llmApiKey)) || config.llmProvider === "fake";
}

export type { LlmClient, LlmCompletionRequest, LlmJsonSchema, LlmProviderName } from "./types.js";

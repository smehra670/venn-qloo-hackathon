import type { LlmClient } from "./types.js";

/** No provider configured. The caller is expected to fall back to the template writer. */
export class NoneLlmClient implements LlmClient {
  readonly provider = "none" as const;

  completeJson<T>(): Promise<T> {
    return Promise.reject(new Error("LLM is not configured. Set LLM_PROVIDER=openai and an API key."));
  }
}

/**
 * Replies successfully but with nothing usable. Lets the brief pipeline exercise its
 * template-fallback path end to end without a real provider or a scripted fake.
 */
export class EmptyLlmClient implements LlmClient {
  readonly provider = "empty" as const;

  completeJson<T>(): Promise<T> {
    return Promise.resolve({} as T);
  }
}

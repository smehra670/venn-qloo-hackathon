import type { Brief, Partner, RunResult } from "@shared/types";

/**
 * Later, a language model can implement this and return generatedBy: "llm".
 * The template writer in template.ts stays the fallback when no key is set.
 * Wire it from the brief route only after LLM_PROVIDER and LLM_API_KEY are set,
 * and keep evidence labels pointing at real signal fields.
 */
export class LlmBriefWriter {
  write(_result: RunResult, _partner: Partner, _variant: number): Promise<Brief> {
    return Promise.reject(new Error("Not configured"));
  }
}

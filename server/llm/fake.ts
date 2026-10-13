import { extractFactPack } from "../brief/prompt.js";
import type { LlmClient, LlmCompletionRequest } from "./types.js";

export interface FakeLlmOptions {
  /** Canned responses returned in call order; the last one repeats once the list is exhausted. */
  responses?: unknown[];
  /** Throw on this call number (1-indexed) instead of returning a response. */
  throwOnCall?: number;
}

/**
 * Deterministic stand-in for an LLM, used by tests and by LLM_PROVIDER=fake. Pass
 * `responses` to script exactly what a test needs (including invalid evidence ids, to
 * exercise the repair / fallback paths); omit it to get a plausible default reply built
 * from whatever fact pack is embedded in the prompt.
 */
export class FakeLlmClient implements LlmClient {
  readonly provider = "fake" as const;
  private calls = 0;

  constructor(private readonly opts: FakeLlmOptions = {}) {}

  get callCount(): number {
    return this.calls;
  }

  async completeJson<T>(request: LlmCompletionRequest): Promise<T> {
    this.calls += 1;
    if (this.opts.throwOnCall === this.calls) {
      throw new Error("Fake LLM call failed on cue.");
    }
    const { responses } = this.opts;
    if (responses && responses.length > 0) {
      const response = responses[Math.min(this.calls - 1, responses.length - 1)];
      return response as T;
    }
    return defaultResponse(request) as T;
  }
}

function defaultResponse(request: LlmCompletionRequest): unknown {
  const factPack = extractFactPack(request.user);
  const partnerName = factPack?.partner.name ?? "the partner";
  const businessName = factPack?.business.name ?? "the business";
  return {
    title: `A pilot with ${partnerName}`,
    format: factPack?.formatHint ?? "Pilot collaboration",
    concept: `${businessName} and ${partnerName} test one small shared idea with their overlapping crowd.`,
    whyItFits: [{ text: "Taste signals line up between the two crowds.", evidenceIds: [] }],
    firstStep: `Send ${partnerName} a short note proposing one trial date.`,
    plan: [
      { when: "Days 1-3", action: "Agree a date, a format, and what each side brings." },
      { when: "Day 7", action: "Run the pilot once and keep it small." },
    ],
    measure: ["Attendance on the day", "Repeat visits in the two weeks after"],
    risks: ["Overlap is a group-level signal, not a guarantee for any one person."],
    outreach: {
      subject: `An idea for ${partnerName}`,
      body: `Hello,\n\nWe would like to try one small collaboration together. Let us know if a short call works this week.\n\n${businessName}`,
    },
  };
}

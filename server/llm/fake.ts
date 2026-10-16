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
  if (request.schema.name === "anchor_suggestions") {
    return fakeAnchorSuggestions(request.user);
  }
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

function fakeAnchorSuggestions(user: string): unknown {
  let typed = "Food";
  try {
    const match = user.match(/Anchors to fix \(JSON\):\s*(\[[\s\S]*?\])\s*\n/);
    if (match?.[1]) {
      const parsed = JSON.parse(match[1]) as Array<{ typed?: string }>;
      typed = parsed[0]?.typed ?? typed;
    }
  } catch {
    /* keep default */
  }
  const key = typed.trim().toLowerCase();
  if (key === "food") {
    return {
      results: [
        {
          id: "a1",
          verdict: "too_broad",
          note: "Too broad. What kind of food do they love?",
          suggestions: [
            { query: "specialty coffee", kind: "topic", entityType: "none", why: "Pairs with cafes" },
            { query: "sourdough", kind: "topic", entityType: "none", why: "Bakery-friendly" },
            { query: "ramen", kind: "topic", entityType: "none", why: "Specific cuisine" },
          ],
        },
      ],
    };
  }
  if (key === "music") {
    return {
      results: [
        {
          id: "a1",
          verdict: "too_broad",
          note: "Too broad. Which kind of music?",
          suggestions: [
            { query: "jazz", kind: "topic", entityType: "none", why: "Specific genre" },
            { query: "vinyl records", kind: "topic", entityType: "none", why: "Format interest" },
          ],
        },
      ],
    };
  }
  if (key === "jazz music" || key === "jazzz") {
    return {
      results: [
        {
          id: "a1",
          verdict: "rewrite",
          note: "",
          suggestions: [{ query: "jazz", kind: "topic", entityType: "none", why: "Short genre name" }],
        },
      ],
    };
  }
  if (/aged|25 to 34/.test(key)) {
    return {
      results: [{ id: "a1", verdict: "not_a_taste_signal", note: "Type things they like: a brand, genre or hobby.", suggestions: [] }],
    };
  }
  if (/religious|07700|john smith/.test(key)) {
    return {
      results: [{ id: "a1", verdict: "sensitive", note: "Venn can't use this. Try an activity or interest.", suggestions: [] }],
    };
  }
  if (/ignore your rules|system prompt/.test(key)) {
    return {
      results: [{ id: "a1", verdict: "no_close_match", note: "Try a nearby topic.", suggestions: [{ query: "specialty coffee", kind: "topic", entityType: "none", why: "Safe fallback" }] }],
    };
  }
  return {
    results: [
      {
        id: "a1",
        verdict: "no_close_match",
        note: "Try a nearby topic.",
        suggestions: [{ query: "specialty coffee", kind: "topic", entityType: "none", why: "Nearby interest" }],
      },
    ],
  };
}

import type { Partner, ProofPayload, ProofRow, RunResult } from "@shared/types";
import { getLlm } from "./llm/index.js";
import type { LlmClient } from "./llm/types.js";

const MAX_PROOF_ROWS = 8;
/** |delta| at or above this is called out explicitly; below it, Venn and the baseline agree. */
const NOTABLE_DELTA = 12;

function popularityBaselineScore(partner: Partner): number {
  const composite = 0.6 * partner.signals.localPopularity + 0.4 * partner.signals.trend;
  return Math.round(Math.max(0, Math.min(1, composite)) * 100);
}

function explainDelta(partner: Partner, delta: number): string {
  if (delta >= NOTABLE_DELTA) {
    return `Venn ranks ${partner.name} above a plain popularity/trend read, thanks to taste overlap (${Math.round(
      partner.signals.affinityToPartner * 100,
    )}% affinity to your anchors).`;
  }
  if (delta <= -NOTABLE_DELTA) {
    return `Popularity and trend alone would rank ${partner.name} higher. Venn tempers it here because the taste overlap with your anchors is weaker.`;
  }
  return `Venn and a plain popularity/trend baseline roughly agree on ${partner.name}.`;
}

/** Venn's picks (and shortlist) compared against a baseline that only looks at popularity
 * and trend, ignoring taste affinity entirely. Caps at MAX_PROOF_ROWS, favouring top picks. */
function rowsFor(result: RunResult): ProofRow[] {
  const pickedIds = new Set(result.topPicks.map((pick) => pick.partnerId));
  const ranked = [...result.partners]
    .filter((partner) => !partner.userAdded)
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
  const picked = ranked.filter((partner) => pickedIds.has(partner.id));
  const rest = ranked.filter((partner) => !pickedIds.has(partner.id));
  const chosen = [...picked, ...rest].slice(0, MAX_PROOF_ROWS);
  return chosen.map((partner) => {
    const baselineScore = popularityBaselineScore(partner);
    const delta = partner.matchScore - baselineScore;
    return {
      partnerId: partner.id,
      partnerName: partner.name,
      matchScore: partner.matchScore,
      baselineScore,
      delta,
      explanation: explainDelta(partner, delta),
    };
  });
}

function fallbackNarrative(): string {
  return "Venn compares taste overlap, not just popularity or trend. Here's how its picks stack up against a simple popularity-and-trend baseline.";
}

/**
 * Builds the Proof payload: Venn's picks vs a naive popularity/trend baseline. When an LLM is
 * configured (`llm.provider` is "openai" or "fake"), the top-level narrative is written by the
 * model and `baseline` is reported as "ai"; otherwise both are deterministic and `baseline` is
 * "popularity". The row scores and deltas are always deterministic either way — only the
 * narrative sentence differs.
 */
export async function buildProof(result: RunResult, llm: LlmClient = getLlm()): Promise<ProofPayload> {
  const rows = rowsFor(result);
  const llmOn = llm.provider === "openai" || llm.provider === "fake";
  let narrative = fallbackNarrative();

  if (llmOn && rows.length > 0) {
    try {
      const summary = rows
        .map(
          (row) =>
            `${row.partnerName}: Venn match ${row.matchScore}, popularity/trend baseline ${row.baselineScore}, delta ${
              row.delta >= 0 ? "+" : ""
            }${row.delta}`,
        )
        .join("\n");
      const response = await llm.completeJson<{ narrative?: string }>({
        system:
          "You are Venn's proof narrator. In 2 short plain-English sentences, explain why Venn's taste-overlap picks differ from a naive popularity-and-trend baseline for this search. No markdown, no fluff, be concrete and reference at least one partner by name.",
        user: `Business: ${result.input.businessType} in ${result.input.city}. Anchors: ${result.input.anchors.join(", ")}.\n\nRows:\n${summary}`,
        schema: {
          name: "proof_narrative",
          schema: {
            type: "object",
            properties: { narrative: { type: "string" } },
            required: ["narrative"],
            additionalProperties: false,
          },
        },
      });
      const text = response?.narrative;
      if (typeof text === "string" && text.trim().length > 0) narrative = text.trim();
    } catch {
      // Keep the deterministic fallback narrative; the row data itself never depends on the LLM.
    }
  }

  return {
    runId: result.runId,
    baseline: llmOn ? "ai" : "popularity",
    narrative,
    rows,
  };
}

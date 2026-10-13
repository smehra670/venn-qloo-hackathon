import type { Brief, BriefLength, BriefTone, Partner, RunResult } from "@shared/types";
import { z } from "zod";
import type { FactPack } from "./facts.js";
import { LIMITS_TEXT } from "./template.js";

const LlmBriefPayloadSchema = z.object({
  title: z.string().min(1).max(160),
  format: z.string().min(1).max(100),
  concept: z.string().min(1).max(1600),
  whyItFits: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        evidenceIds: z.array(z.string().min(1)).max(8),
      }),
    )
    .min(1)
    .max(6),
  firstStep: z.string().min(1).max(500),
  plan: z
    .array(z.object({ when: z.string().min(1).max(60), action: z.string().min(1).max(400) }))
    .min(1)
    .max(8),
  measure: z.array(z.string().min(1).max(240)).min(1).max(6),
  risks: z.array(z.string().min(1).max(400)).min(1).max(5),
  outreach: z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(2000) }),
});

export type LlmBriefPayload = z.infer<typeof LlmBriefPayloadSchema>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/**
 * Validates the LLM's JSON against the brief shape, then checks that every evidence
 * citation actually exists in the fact pack — the one place an LLM is prone to invent
 * something that looks plausible but is not real.
 */
export function validateLlmPayload(raw: unknown, factPack: FactPack): ValidationResult<LlmBriefPayload> {
  const parsed = LlmBriefPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`) };
  }
  const validIds = new Set(factPack.evidence.map((item) => item.id));
  const issues: string[] = [];
  for (const item of parsed.data.whyItFits) {
    for (const id of item.evidenceIds) {
      if (!validIds.has(id)) issues.push(`Unknown evidence id cited: ${id}`);
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: parsed.data };
}

export function toBrief(
  payload: LlmBriefPayload,
  factPack: FactPack,
  result: RunResult,
  partner: Partner,
  variant: number,
  tone: BriefTone,
  length: BriefLength,
): Brief {
  return {
    runId: result.runId,
    partnerId: partner.id,
    partnerName: partner.name,
    variant,
    variantCount: 3,
    title: payload.title,
    format: payload.format,
    concept: payload.concept,
    whyItFits: payload.whyItFits.map((item) => ({ text: item.text, evidence: item.evidenceIds })),
    firstStep: payload.firstStep,
    plan: payload.plan,
    measure: payload.measure,
    risks: payload.risks,
    outreach: payload.outreach,
    // The disclaimer is fixed, trustworthy copy — never LLM-authored.
    limits: LIMITS_TEXT,
    generatedBy: "llm",
    tone,
    length,
    sources: factPack.evidence,
  };
}

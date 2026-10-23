import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import type { RunResult } from "@shared/types";
import { businessLabel } from "../brief/template.js";

export interface ChatPartnerFact {
  id: string;
  name: string;
  kind: string;
  matchScore: number;
  local: boolean;
  locationLabel: string | null;
  sharedTags: string[];
  feasibility: string | null;
  topReason: string | null;
}

export interface ChatFactPack {
  business: {
    name: string;
    type: string;
    city: string;
    anchors: string[];
  };
  headline: string;
  notes: string[];
  partners: ChatPartnerFact[];
  decisions: { decision: string; reason: string }[];
}

/**
 * Extracts only facts already present on the run result — same discipline as the brief writer's
 * fact pack (`server/brief/facts.ts`), just scoped to the whole run instead of one partner. Every
 * partner the user could ask about is included (capped so the prompt stays a sane size); nothing
 * here is computed or guessed, so the chat model has nothing to hallucinate from.
 */
export function buildChatFactPack(result: RunResult): ChatFactPack {
  const businessType =
    result.input.businessType === "other" && result.input.businessTypeCustom
      ? result.input.businessTypeCustom
      : BUSINESS_TYPE_LABELS[result.input.businessType];

  return {
    business: {
      name: businessLabel(result.input),
      type: businessType,
      city: result.city?.name ?? result.input.city,
      anchors: [...result.input.anchors],
    },
    headline: result.headline,
    notes: result.notes,
    partners: result.partners.slice(0, 30).map((partner) => ({
      id: partner.id,
      name: partner.name,
      kind: partner.kind,
      matchScore: partner.matchScore,
      local: partner.local,
      locationLabel: partner.locationLabel ?? null,
      sharedTags: partner.sharedTags.slice(0, 5),
      feasibility: partner.feasibility?.level ?? null,
      topReason: partner.reasons[0] ?? null,
    })),
    decisions: (result.decisions ?? []).slice(0, 12).map((entry) => ({ decision: entry.decision, reason: entry.reason })),
  };
}

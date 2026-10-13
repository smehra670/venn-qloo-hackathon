import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import type { Partner, RunResult } from "@shared/types";
import { businessLabel, formatsFor } from "./template.js";

export interface FactEvidence {
  id: string;
  label: string;
  value: string;
  origin: "data" | "interpretation";
}

export interface FactPack {
  business: {
    name: string;
    type: string;
    city: string;
    anchors: string[];
  };
  partner: {
    name: string;
    kind: string;
    local: boolean;
    locationLabel: string | null;
    sharedTags: string[];
    tags: string[];
    matchScore: number;
    surprise: number;
  };
  signals: {
    affinityToPartner: number;
    affinityFromPartner: number;
    tagOverlap: number;
    localPopularity: number;
    trend: number;
  };
  evidence: FactEvidence[];
  /** A template format name offered as loose inspiration for this variant slot; not a fact to cite. */
  formatHint: string;
}

/**
 * Extracts only facts already present on the run result and the partner. Never invents a
 * number, a tag, or an evidence item — this is the single source of truth the LLM (and the
 * validator) are allowed to cite from.
 */
export function buildFactPack(result: RunResult, partner: Partner, variant: number): FactPack {
  const evidence: FactEvidence[] = partner.evidence.map((item, index) => ({
    id: `ev-${index}`,
    label: item.label,
    value: item.value,
    origin: item.origin,
  }));
  const formats = formatsFor(partner.kind);
  const formatIndex = formats.length > 0 ? ((variant % formats.length) + formats.length) % formats.length : 0;
  const formatHint = formats[formatIndex] ?? "Collaboration";
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
    partner: {
      name: partner.name,
      kind: partner.kind,
      local: partner.local,
      locationLabel: partner.locationLabel ?? null,
      sharedTags: [...partner.sharedTags],
      tags: [...partner.tags],
      matchScore: partner.matchScore,
      surprise: partner.surprise,
    },
    signals: { ...partner.signals },
    evidence,
    formatHint,
  };
}

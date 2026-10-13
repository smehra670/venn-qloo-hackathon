import type { ComparePayload, CompareSignal, Partner, RunResult } from "@shared/types";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

const SIGNAL_LABELS: { key: keyof Partner["signals"]; label: string }[] = [
  { key: "affinityToPartner", label: "Your anchors \u2192 partner" },
  { key: "affinityFromPartner", label: "Partner \u2192 your category" },
  { key: "tagOverlap", label: "Tag overlap" },
  { key: "localPopularity", label: "Local popularity" },
  { key: "trend", label: "Trend" },
];

/**
 * Builds a lightweight "compare audiences" readout for a single partner against the rest of
 * this search: shared tags, the forward/reverse affinity probe already used to score it (see
 * `buildPartner` in each provider's mapping module), and a popularity delta against the
 * run's median. Deliberately makes no new provider calls — the score step already blends a
 * business-anchors-to-partner probe with a reverse (partner-as-signal) probe, so repeating
 * that here would just be the same network round trip again. That also makes this
 * deterministic for every provider, including mock, with nothing to fake or stub in tests.
 */
export function buildCompare(result: RunResult, partner: Partner): ComparePayload {
  // The baseline is every other Venn-discovered partner in this search, excluding the user's
  // own "Check a partner" additions (those aren't part of what Venn found, so they would
  // skew the median). Falls back to the partner itself when it is the only one around.
  const peers = result.partners.filter((item) => item.id !== partner.id && !item.userAdded);
  const baseline = peers.length > 0 ? peers : [partner];

  const signals: CompareSignal[] = SIGNAL_LABELS.map(({ key, label }) => ({
    label,
    value: partner.signals[key],
    median: median(baseline.map((item) => item.signals[key])),
  }));

  const popularityDelta =
    partner.signals.localPopularity - median(baseline.map((item) => item.signals.localPopularity));

  return {
    runId: result.runId,
    partnerId: partner.id,
    partnerName: partner.name,
    sharedTags: partner.sharedTags,
    affinityToPartner: partner.signals.affinityToPartner,
    affinityFromPartner: partner.signals.affinityFromPartner,
    popularityDelta,
    signals,
    note: "Built from this search's existing taste signals (forward + reverse affinity probes already used to score this partner); no extra calls.",
  };
}

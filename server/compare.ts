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

const COMPUTED_NOTE =
  "Built from this search's existing taste signals (forward + reverse affinity probes already used to score this partner); no extra calls.";
const QLOO_TAGS_NOTE =
  "Shared tags from Qloo's /v2/analysis/compare (A = your matched anchors, B = this partner), scored both ways.";

export interface CompareQlooTag {
  label: string;
  /** Side A's (your anchors') score for this tag, 0-1 where known. */
  a: number;
  /** Side B's (this partner's) score for this tag, 0-1 where known. */
  b: number;
}

function numberField(record: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * Normalises `/v2/analysis/compare`'s `results.tags` (shape unconfirmed beyond
 * `tags|a|b|matchEntities` — the hackathon probe's own `filter.type` returned it empty; see
 * `docs/QLOO_CONTRACT_V2.md`) into a plain `{ label, a, b }[]`, trying several plausible field
 * names defensively rather than assuming one exact shape. Returns `null` (never `[]`) for an
 * empty/unusable input so callers can tell "nothing to normalise" apart from "normalised to
 * nothing", and degrade to the computed tag intersection in both cases.
 */
export function normalizeCompareTags(raw: unknown): CompareQlooTag[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: CompareQlooTag[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const label =
      (typeof record.name === "string" && record.name) ||
      (typeof record.tag_id === "string" && record.tag_id) ||
      (typeof record.id === "string" && record.id) ||
      undefined;
    if (!label) continue;
    const a =
      numberField(record, ["a", "query_a", "affinity_a", "a_affinity"]) ??
      numberField(asRecord(record.a), ["affinity", "score", "value"]) ??
      0;
    const b =
      numberField(record, ["b", "query_b", "affinity_b", "b_affinity"]) ??
      numberField(asRecord(record.b), ["affinity", "score", "value"]) ??
      0;
    out.push({ label, a: Math.max(0, Math.min(1, a)), b: Math.max(0, Math.min(1, b)) });
  }
  return out.length > 0 ? out : null;
}

/**
 * Builds the "compare audiences" readout for a single partner against the rest of this search.
 * The signal bars and popularity delta always come from this run's own existing scoring
 * signals — deterministic and network-free for every provider, including mock.
 *
 * `tryLive`, when given, is awaited for a possible live `/v2/analysis/compare` result (see
 * `normalizeCompareTags`); its shared tags replace the signal-based tag intersection when it
 * resolves to a non-empty list, and `source` is set to `"qloo_tags"`. Any failure, timeout, or
 * empty tags from `tryLive` — including it simply being omitted, e.g. mock/snapshot providers
 * or an exhausted `COMPARE_MAX_CALLS_PER_RUN` budget — falls back to the always-available
 * `"computed_from_tags"` path, so the caller never has to special-case the degrade itself.
 */
export async function buildCompare(
  result: RunResult,
  partner: Partner,
  tryLive?: () => Promise<CompareQlooTag[] | null>,
): Promise<ComparePayload> {
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

  let sharedTags = partner.sharedTags;
  let source: ComparePayload["source"] = "computed_from_tags";
  let note = COMPUTED_NOTE;
  let tagScores: ComparePayload["tagScores"];

  if (tryLive) {
    try {
      const liveTags = await tryLive();
      if (liveTags && liveTags.length > 0) {
        const withBoth = liveTags.filter((tag) => tag.a > 0 && tag.b > 0).map((tag) => tag.label);
        sharedTags = (withBoth.length > 0 ? withBoth : liveTags.map((tag) => tag.label)).slice(0, 8);
        source = "qloo_tags";
        note = QLOO_TAGS_NOTE;
        tagScores = liveTags.slice(0, 12).map((tag) => ({ label: tag.label, a: tag.a, b: tag.b }));
      }
      // liveTags === null: Qloo returned 200 with empty tags (probed behaviour depending on
      // filter.type) — fall through to the computed fallback already set above.
    } catch {
      // Network error, timeout, or budget guard upstream — same computed fallback.
    }
  }

  return {
    runId: result.runId,
    partnerId: partner.id,
    partnerName: partner.name,
    sharedTags,
    affinityToPartner: partner.signals.affinityToPartner,
    affinityFromPartner: partner.signals.affinityFromPartner,
    popularityDelta,
    signals,
    note,
    source,
    ...(tagScores ? { tagScores } : {}),
  };
}

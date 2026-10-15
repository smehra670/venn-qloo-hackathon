export const BUSINESS_TYPES = [
  "cafe",
  "restaurant",
  "bar",
  "music_venue",
  "gym_studio",
  "retail_shop",
  "fashion_brand",
  "bakery",
  "bookshop",
  "salon_spa",
  "hotel",
  "coworking",
  "other",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const PARTNER_KINDS = [
  "food",
  "drink",
  "venue",
  "music",
  "culture",
  "retail",
  "fashion",
  "fitness",
  "wellness",
] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export type EntityType =
  | "brand"
  | "place"
  | "artist"
  | "person"
  | "podcast"
  | "tv_show"
  | "movie"
  | "book"
  | "destination";

export type ProviderName = "mock" | "qloo" | "snapshot";

export const STEP_ORDER = [
  "resolve",
  "plan",
  "discover",
  "score",
  "enrich",
  "adapt",
  "assemble",
] as const;
export type StepId = (typeof STEP_ORDER)[number];

/**
 * Optional fine-tune preferences set on the setup screen. Purely advisory: they drive the
 * rule-based `goalFit` on each `Partner` and a display-only re-rank of `topPicks`, but never
 * change `matchScore` (see `server/agent/goals.ts`).
 */
export interface Goals {
  preferLocal?: boolean;
  preferSurprising?: boolean;
  budget?: "low" | "medium" | "flexible";
  avoidKinds?: PartnerKind[];
  notes?: string;
}

export interface BusinessInput {
  businessName?: string;
  businessType: BusinessType;
  businessTypeCustom?: string;
  city: string;
  anchors: string[];
  goals?: Goals;
}

export interface ResolvedAnchor {
  input: string;
  status: "matched" | "keyword" | "guessed";
  entityId?: string;
  entityName?: string;
  entityType?: EntityType;
  tags: string[];
  note: string;
}

export interface SignalBreakdown {
  affinityToPartner: number;
  affinityFromPartner: number;
  tagOverlap: number;
  localPopularity: number;
  trend: number;
}

export interface EvidenceItem {
  label: string;
  value: string;
  origin: "data" | "interpretation";
}

/**
 * Frozen stretch/score mapping captured when a run's partners were scored. Persisted on
 * `RunResult` so Proof and Check-a-partner can re-score a new candidate against the exact
 * same band instead of a fresh one, which would make scores incomparable.
 */
export interface Normalization {
  minRaw: number;
  maxRaw: number;
}

export interface Partner {
  id: string;
  name: string;
  kind: PartnerKind;
  entityType: EntityType;
  blurb: string;
  local: boolean;
  locationLabel?: string;
  matchScore: number;
  surprise: number;
  isSurprising: boolean;
  reasons: string[];
  sharedTags: string[];
  tags: string[];
  signals: SignalBreakdown;
  evidence: EvidenceItem[];
  relatedIds: string[];
  parentId?: string;
  expanded?: boolean;
  /** Added by the user via "Check a partner" rather than discovered by Venn. Scored with
   * this run's frozen normalization so it is comparable to the rest, but rendered distinctly
   * (dashed) since Venn did not choose it. */
  userAdded?: boolean;
  /** Mirrors `userAdded` as an enum ("discovered" by Venn's own search vs "user_added" via
   * Check-a-partner). Kept alongside `userAdded` rather than replacing it to avoid touching
   * every existing call site; new code should prefer this field. */
  origin?: "discovered" | "user_added";
  /** Best-effort provenance for the score shown: which discover/rank call it came from and
   * what raw numbers fed it. Present when the provider recorded a `DiscoverSpec`/rank-together
   * call for this partner's kind; absent for legacy runs or providers that can't recompute it. */
  scoreBasis?: ScoreBasis;
  /** 0-1 fit to the optional `BusinessInput.goals` fine-tune preferences, from
   * `server/agent/goals.ts`. Rule-based and display-only: it never changes `matchScore`,
   * only secondary ordering (e.g. top-pick tiebreaks) and UI notes. Absent when no goals
   * were set for this run. */
  goalFit?: number;
  /** Rule-based sanity checks run on top picks only (see `server/agent/feasibility.ts`):
   * flags things like a kind clash with the business's own category or thin evidence.
   * `ok: false` does not remove the partner, just surfaces a caveat in the UI. */
  feasibility?: { ok: boolean; notes: string[] };
}

/**
 * Records exactly what a discover call asked Qloo (or the mock/snapshot equivalent) for, and
 * which entity ids came back. Persisted on `RunResult.discoverSpecs` so Proof and Check can
 * later replay the same call shape with `TasteProvider.rankTogether`, instead of mixing
 * percentiles from separate calls (see `docs/SCORING.md`).
 */
export interface DiscoverSpec {
  kind: PartnerKind;
  entityType: EntityType;
  /** Redacted request params actually used for this call (signals, filters, location) —
   * stringified so the spec is plain JSON and safe to persist/replay. */
  params: Record<string, string>;
  /** Entity ids returned by that discover call, before any trimming for the shortlist. */
  poolIds: string[];
}

/** Best-effort provenance for a single partner's score (see `DiscoverSpec`). */
export interface ScoreBasis {
  callId: string;
  poolSize: number;
  rawAffinity: number;
  popularity: number;
}

/** One row from `TasteProvider.rankTogether`: an entity's affinity/popularity from a single
 * "ranked together" call, so every id in the same call is comparable. */
export interface RankEntry {
  entityId: string;
  affinity: number;
  popularity: number;
  /** 0 (same industry) to 1 (very different industry); omitted when not meaningful. */
  distance?: number;
}

export type PickRole = "best_overall" | "best_local" | "wildcard";
export interface TopPick {
  role: PickRole;
  partnerId: string;
  headline: string;
}

export interface CityInfo {
  name: string;
  center: [number, number];
  zoom: number;
  hasLocalData: boolean;
}

export interface RunResult {
  runId: string;
  createdAt: number;
  provider: ProviderName;
  providerLabel: string;
  input: BusinessInput;
  resolvedAnchors: ResolvedAnchor[];
  plannedKinds: PartnerKind[];
  partners: Partner[];
  topPicks: TopPick[];
  city: CityInfo | null;
  headline: string;
  notes: string[];
  limits: string[];
  stats: {
    candidatesConsidered: number;
    retries: number;
    toolCalls: number;
    elapsedMs: number;
  };
  /** Stretch params used to map raw affinity into this run's 52-96 match score band.
   * Absent for providers that cannot recompute a candidate score (e.g. static snapshots). */
  normalization?: Normalization;
  /** Agent decision log ("How Venn decided"): short rationale entries captured during
   * plan/discover/adapt/assemble. Empty when nothing notable happened. */
  decisions?: DecisionLogEntry[];
  /** One entry per kind actually searched during discover/adapt, recording the request shape
   * and pool ids so Proof/Check can call `rankTogether` on the same shape later. Absent on
   * runs from before this was tracked ("legacy" runs) — Proof degrades gracefully for those. */
  discoverSpecs?: DiscoverSpec[];
}

export interface HeatSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  intensityA: number;
  intensityB: number;
  overlap: number;
  rank: number | null;
  why: string;
}

export interface Heatmap {
  runId: string;
  partnerId: string;
  partnerName: string;
  city: CityInfo;
  spots: HeatSpot[];
  caption: string;
}

export type BriefTone = "warm" | "direct" | "playful";
export type BriefLength = "short" | "standard";

export interface BriefSource {
  id: string;
  label: string;
  value: string;
  origin: "data" | "interpretation";
}

export interface Brief {
  runId: string;
  partnerId: string;
  partnerName: string;
  variant: number;
  variantCount: number;
  title: string;
  format: string;
  concept: string;
  whyItFits: { text: string; evidence: string[] }[];
  firstStep: string;
  plan: { when: string; action: string }[];
  measure: string[];
  risks: string[];
  outreach: { subject: string; body: string };
  limits: string;
  generatedBy: "template" | "llm";
  /** Model id used to write this brief, e.g. "gpt-4.1-mini" or "claude-3-5-sonnet-latest".
   * `"template"` for the deterministic fallback writer. */
  model?: string;
  tone?: BriefTone;
  length?: BriefLength;
  /** Evidence a reader can trace whyItFits citations back to. Present on LLM-written briefs. */
  sources?: BriefSource[];
}

/** One entry in the agent's "how Venn decided" log, surfaced live via the `decision` SSE
 * event and persisted on `RunResult.decisions` so it survives a page reload. */
export interface DecisionLogEntry {
  step?: StepId;
  decision: string;
  reason: string;
}

export type AgentEvent =
  | { type: "run_started"; runId: string; provider: ProviderName; providerLabel: string }
  | { type: "step_started"; step: StepId; title: string }
  | { type: "tool_call"; step: StepId; callId: string; tool: string; args: string }
  | { type: "tool_result"; step: StepId; callId: string; tool: string; summary: string; ms: number }
  | { type: "step_note"; step: StepId; text: string }
  | { type: "retry"; step: StepId; reason: string }
  | { type: "decision"; step?: StepId; decision: string; reason: string }
  | { type: "step_completed"; step: StepId; summary: string }
  | { type: "result"; result: RunResult }
  | { type: "error"; message: string }
  | { type: "cancelled" };

export type StoredEvent = AgentEvent & { id: number; at: number };
export type RunStatus = "running" | "done" | "error" | "cancelled";

export interface ExampleInput {
  businessType: BusinessType;
  city: string;
  anchors: string[];
  businessName?: string;
}

export type ProofBaseline = "popularity" | "ai";

/** One entity's read within a single `rankTogether` call: both Venn's shortlisted items and
 * the "obvious" baseline items share this shape so they can be paired and compared fairly. */
export interface ProofItem {
  entityId: string;
  name: string;
  /** 0-100, computed from *this* rankTogether call only (never mixed with another call). */
  score: number;
  rawAffinity?: number;
  popularity?: number;
}

/** Proof for one partner kind: Venn's pick(s) vs an "obvious" baseline, ranked together in
 * one Qloo call (or the mock/snapshot equivalent) so the scores are directly comparable. */
export interface ProofKindGroup {
  kind: PartnerKind;
  /** Id of the call this group's scores came from; ties back to `ProofResult.calls`. Absent
   * when this kind had no `DiscoverSpec` to replay (legacy run) — scores are omitted too. */
  callId?: string;
  poolSize: number;
  vennItems: ProofItem[];
  baselineItems: ProofItem[];
  /** Set when this kind couldn't be ranked together (no DiscoverSpec, or the call failed). */
  note?: string;
}

export interface ProofSummary {
  kindsCompared: number;
  avgVennScore: number;
  avgBaselineScore: number;
  avgDelta: number;
  vennWins: number;
  baselineWins: number;
  ties: number;
}

/** One `rankTogether` call made while building this Proof, for the "call log" caveat/UI. */
export interface ProofCallLog {
  callId: string;
  kind: PartnerKind;
  poolSize: number;
}

/**
 * Proof payload: Venn's picks vs an "obvious" baseline, scored by ranking both together in
 * the same call per kind (see `docs/SCORING.md`) rather than mixing percentiles across calls.
 * `baseline` is "ai" when an LLM suggested the obvious names (and wrote `narrative`); otherwise
 * the baseline is the most popular item in the same discover pool and both are deterministic.
 */
export interface ProofResult {
  runId: string;
  baseline: ProofBaseline;
  narrative: string;
  perKind: ProofKindGroup[];
  summary: ProofSummary;
  /** Plain-English notes: call-budget truncation, legacy runs, unresolved baseline names, the
   * standard "relative to this search" disclaimer. Always has at least one entry. */
  caveats: string[];
  calls: ProofCallLog[];
  /** True when the run predates `discoverSpecs` (or the provider can't recompute them), so
   * `perKind` has no scored items anywhere — the UI shows a legacy message instead of rows. */
  legacy: boolean;
}

/** One signal bar in the "Compare audiences" panel: this partner's value against the
 * median of the same signal across the rest of the run's partners. */
export interface CompareSignal {
  label: string;
  value: number;
  median: number;
}

/** "Compare audiences" readout for a single partner (see `server/compare.ts`). Built
 * entirely from signals already computed during scoring, so it is deterministic and
 * network-free for every provider, including mock. */
export interface ComparePayload {
  runId: string;
  partnerId: string;
  partnerName: string;
  sharedTags: string[];
  affinityToPartner: number;
  affinityFromPartner: number;
  /** This partner's local popularity minus the median local popularity across the run. */
  popularityDelta: number;
  signals: CompareSignal[];
  note: string;
}

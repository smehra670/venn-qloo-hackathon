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

/** A single row in the Proof view: one Venn-picked (or shortlisted) partner compared
 * against a simple popularity/trend baseline that ignores taste affinity. */
export interface ProofRow {
  partnerId: string;
  partnerName: string;
  matchScore: number;
  baselineScore: number;
  delta: number;
  explanation: string;
}

export type ProofBaseline = "popularity" | "ai";

export interface ProofPayload {
  runId: string;
  /** "popularity" when no LLM is configured; "ai" when the narrative below was LLM-written. */
  baseline: ProofBaseline;
  narrative: string;
  rows: ProofRow[];
}

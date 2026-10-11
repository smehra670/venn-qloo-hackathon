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

export type ProviderName = "mock" | "qloo";

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

export interface BusinessInput {
  businessName?: string;
  businessType: BusinessType;
  businessTypeCustom?: string;
  city: string;
  anchors: string[];
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
}

export type AgentEvent =
  | { type: "run_started"; runId: string; provider: ProviderName; providerLabel: string }
  | { type: "step_started"; step: StepId; title: string }
  | { type: "tool_call"; step: StepId; callId: string; tool: string; args: string }
  | { type: "tool_result"; step: StepId; callId: string; tool: string; summary: string; ms: number }
  | { type: "step_note"; step: StepId; text: string }
  | { type: "retry"; step: StepId; reason: string }
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

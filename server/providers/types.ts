import type {
  BusinessInput,
  CityInfo,
  DecisionOrigin,
  DiscoverSpec,
  EntityType,
  Normalization,
  PartnerKind,
  ProviderName,
  RankEntry,
  VenueFacts,
} from "@shared/types";
import type { CardsRequest, CardsResponse, RefillRequest, RefillResponse } from "@shared/schemas";

/** Provider-agnostic entity used as a discover/score candidate. */
export interface ProviderEntity {
  id: string;
  name: string;
  kind: PartnerKind;
  entityType: EntityType;
  blurb: string;
  tags: Record<string, number>;
  audienceTags: string[];
  popularity: number;
  trend: number;
  city?: string;
  neighbourhood?: string;
  aliases?: string[];
  /** Set for `place` entities from a live Qloo point+radius discover call (see
   * `server/providers/qloo/mapping.ts`); absent for mock/snapshot and for non-place kinds. */
  venueFacts?: VenueFacts;
  /** Name of the resolved (matched) anchor Qloo's `feature.explainability` attributed this
   * candidate's affinity to the most, when available — see `explainabilityAnchor` in
   * `server/providers/qloo/mapping.ts`. Surfaced as an extra "data"-origin evidence item. */
  explainabilityAnchorName?: string;
  /** 0-1 score for `explainabilityAnchorName`, straight from Qloo's explainability payload. */
  explainabilityScore?: number;
  /** Every anchor's explainability share for this candidate (topic proxies folded into their
   * topic's name), largest first. */
  drivers?: import("@shared/types").MatchDriver[];
  /** Raw Qloo tag ids on the entity (all of them), used to find tastes shared with your crowd. */
  tagIds?: string[];
}

export interface Candidate {
  entry: ProviderEntity;
  local: boolean;
  provisional: number;
}

export interface ProviderContext {
  signal: AbortSignal;
  trace<T>(tool: string, args: string, fn: () => Promise<T>, summarize: (result: T) => string): Promise<T>;
  /**
   * Appends a short "how Venn decided" entry (a `decision` SSE event, plus the runner's
   * decision log persisted on `RunResult.decisions`). `decision` is a short label; `reason`
   * is one sentence of context. `meta.origin` defaults to "rule" when omitted. No-op in
   * contexts that don't track a decision log (e.g. the quiet context used for
   * expand/heatmap/check-a-partner calls).
   */
  decide(decision: string, reason: string, meta?: { origin?: DecisionOrigin; kind?: PartnerKind; subject?: string }): void;
}

export interface TasteProvider {
  readonly name: ProviderName;
  readonly label: string;
  resolveAnchors(input: BusinessInput, ctx: ProviderContext): Promise<import("@shared/types").ResolvedAnchor[]>;
  resolveCity(input: BusinessInput, ctx: ProviderContext): Promise<CityInfo | null>;
  planKinds(
    input: BusinessInput,
    resolved: import("@shared/types").ResolvedAnchor[],
    ctx: ProviderContext,
  ): Promise<PartnerKind[]>;
  discover(
    input: BusinessInput,
    resolved: import("@shared/types").ResolvedAnchor[],
    kind: PartnerKind,
    ctx: ProviderContext,
    /** Set by the implementation to the `DiscoverSpec` it used (request shape + pool ids),
     * so the runner can attach it to `RunResult.discoverSpecs` for later `rankTogether` calls.
     * Left unset when the call doesn't correspond to a replayable spec (e.g. a text-search
     * fallback instead of a real insights call). `specs` is used when one kind made more than
     * one call (e.g. local shops plus brands). */
    out?: { spec?: DiscoverSpec; specs?: DiscoverSpec[] },
  ): Promise<Candidate[]>;
  score(
    input: BusinessInput,
    resolved: import("@shared/types").ResolvedAnchor[],
    candidates: Candidate[],
    ctx: ProviderContext,
    /** Set by the implementation to the normalization it used, so the runner can freeze it
     * onto the `RunResult` for later Proof/Check calls. Optional: callers that don't need it
     * (e.g. `expand`) can omit it. */
    out?: { normalization?: Normalization },
  ): Promise<import("@shared/types").Partner[]>;
  enrich(
    input: BusinessInput,
    partners: import("@shared/types").Partner[],
    ctx: ProviderContext,
  ): Promise<import("@shared/types").Partner[]>;
  expand(
    run: import("@shared/types").RunResult,
    partnerId: string,
    ctx: ProviderContext,
  ): Promise<import("@shared/types").Partner[]>;
  heatmap(
    run: import("@shared/types").RunResult,
    partnerId: string,
    ctx: ProviderContext,
  ): Promise<import("@shared/types").Heatmap | null>;
  /**
   * Resolves a free-text name (Check-a-partner) to a candidate and scores it with the run's
   * frozen normalization, so it lands on the same scale as the rest of the run's partners.
   * Returns null when nothing could be resolved/scored (the route turns that into a 404).
   */
  checkPartner(
    input: BusinessInput,
    resolved: import("@shared/types").ResolvedAnchor[],
    query: { name: string; entityHint?: string },
    frozen: { normalization: Normalization; medianScore: number },
    ctx: ProviderContext,
  ): Promise<import("@shared/types").Partner | null>;
  /**
   * Ranks `spec.poolIds` plus `extraEntityIds` together in one call (or the mock/snapshot
   * equivalent), so every returned affinity is comparable — the core fix behind Proof/Check
   * (see `docs/SCORING.md`). Returns one `RankEntry` per id Qloo (or the mock catalog) could
   * place; ids it has no information for are simply omitted rather than guessed.
   *
   * - Qloo: `GET /v2/insights` with `spec.params` plus `filter.results.entities` (chunked at
   *   20 ids) and `filter.type` from `spec.entityType`.
   * - Mock: deterministic cosine affinity against the demo catalog using the audience profile
   *   encoded in `spec.params`.
   * - Snapshot: best-effort from the run's own stored partners; empty array (with the caller
   *   expected to surface a "legacy" note) when nothing can be recomputed.
   */
  rankTogether(spec: DiscoverSpec, extraEntityIds: string[], ctx: ProviderContext): Promise<RankEntry[]>;
  /**
   * Setup's "Swipe your crowd" deck for a business type and city (`POST /api/anchors/cards`).
   * Every implementation builds it with `buildDeck()` (server/anchors/deck.ts) and sets each
   * card's provenance; see server/anchors/cards.ts and docs/ANCHORS.md.
   */
  getSwipeCards(req: CardsRequest, signal?: AbortSignal): Promise<CardsResponse>;
  /** Up to 6 more cards chosen from the person's Yeses (`POST /api/anchors/cards/refill`). */
  getRefillCards(req: RefillRequest, signal?: AbortSignal): Promise<RefillResponse>;
}

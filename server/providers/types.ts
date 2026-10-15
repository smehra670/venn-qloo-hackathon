import type {
  BusinessInput,
  CityInfo,
  DiscoverSpec,
  EntityType,
  Normalization,
  PartnerKind,
  ProviderName,
  RankEntry,
} from "@shared/types";

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
   * is one sentence of context. No-op in contexts that don't track a decision log (e.g. the
   * quiet context used for expand/heatmap/check-a-partner calls).
   */
  decide(decision: string, reason: string): void;
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
     * fallback instead of a real insights call). */
    out?: { spec?: DiscoverSpec },
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
}

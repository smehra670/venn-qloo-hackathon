import type {
  BusinessInput,
  CityInfo,
  EntityType,
  PartnerKind,
  ProviderName,
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
  ): Promise<Candidate[]>;
  score(
    input: BusinessInput,
    resolved: import("@shared/types").ResolvedAnchor[],
    candidates: Candidate[],
    ctx: ProviderContext,
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
}

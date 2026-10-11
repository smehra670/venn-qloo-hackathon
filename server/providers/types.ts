import type { BusinessInput, PartnerKind, ProviderName } from "@shared/types";
import type { CatalogEntry } from "./mock/catalog.js";

export interface Candidate {
  entry: CatalogEntry;
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

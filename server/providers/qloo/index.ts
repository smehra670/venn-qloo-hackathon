import type { BusinessInput, Heatmap, Partner, PartnerKind, ResolvedAnchor, RunResult } from "@shared/types";
import type { Candidate, ProviderContext, TasteProvider } from "../types.js";

/**
 * Stub for a later Qloo-backed provider. Every method fails on purpose.
 * Planned mapping (also in docs/QLOO_INTEGRATION.md):
 * - resolveAnchors: entity search (/search) and tag search (/v2/tags)
 * - discover: insights (/v2/insights) with signal.interests.entities and filter.type
 * - score: insights filtered to candidate entities, both directions
 * - enrich: bias.trends and the entity trends endpoint
 * - heatmap: insights heatmap type with neighbourhood boundaries
 * - expand: insights seeded with the selected partner
 * The API key stays on the server. Never send personal data.
 */
export class QlooTasteProvider implements TasteProvider {
  readonly name = "qloo" as const;
  readonly label = "Qloo";

  resolveAnchors(_input: BusinessInput, _ctx: ProviderContext): Promise<ResolvedAnchor[]> {
    return notReady();
  }

  planKinds(_input: BusinessInput, _resolved: ResolvedAnchor[], _ctx: ProviderContext): Promise<PartnerKind[]> {
    return notReady();
  }

  discover(
    _input: BusinessInput,
    _resolved: ResolvedAnchor[],
    _kind: PartnerKind,
    _ctx: ProviderContext,
  ): Promise<Candidate[]> {
    return notReady();
  }

  score(
    _input: BusinessInput,
    _resolved: ResolvedAnchor[],
    _candidates: Candidate[],
    _ctx: ProviderContext,
  ): Promise<Partner[]> {
    return notReady();
  }

  enrich(_input: BusinessInput, _partners: Partner[], _ctx: ProviderContext): Promise<Partner[]> {
    return notReady();
  }

  expand(_run: RunResult, _partnerId: string, _ctx: ProviderContext): Promise<Partner[]> {
    return notReady();
  }

  heatmap(_run: RunResult, _partnerId: string, _ctx: ProviderContext): Promise<Heatmap | null> {
    return notReady();
  }
}

function notReady(): Promise<never> {
  return Promise.reject(new Error("The Qloo provider is not implemented yet. Set TASTE_PROVIDER=mock."));
}

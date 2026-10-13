import type { BusinessInput, CityInfo, Heatmap, Partner, PartnerKind, ResolvedAnchor, RunResult } from "@shared/types";
import type { Candidate, ProviderContext, TasteProvider } from "../types.js";
import { tagLabel } from "./taxonomy.js";
import {
  candidatesForKind,
  cityFor,
  expandFrom,
  heatmapFor,
  planKinds,
  resolveOne,
  scoreCandidates,
} from "./engine.js";

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export class MockTasteProvider implements TasteProvider {
  readonly name = "mock" as const;
  readonly label = "Demo data";

  async resolveAnchors(input: BusinessInput, ctx: ProviderContext): Promise<ResolvedAnchor[]> {
    const resolved = await Promise.all(
      input.anchors.map((anchor) =>
        ctx.trace(
          "search_entities",
          `q: ${anchor}`,
          async () => resolveOne(anchor),
          (result) => result.status,
        ),
      ),
    );
    await mapLimit(
      resolved.filter((item) => item.status === "keyword"),
      3,
      (item) =>
        ctx.trace(
          "search_tags",
          `q: ${item.input}`,
          async () => item.tags,
          (tags) => tags.map((tag) => tagLabel(tag)).join(", "),
        ),
    );
    return resolved;
  }

  async resolveCity(input: BusinessInput, ctx: ProviderContext): Promise<CityInfo | null> {
    return ctx.trace(
      "search_entities",
      `city: ${input.city}`,
      async () => cityFor(input),
      (value) => (value ? `${value.name} · local data` : "no local map"),
    );
  }

  async planKinds(input: BusinessInput, _resolved: ResolvedAnchor[], ctx: ProviderContext): Promise<PartnerKind[]> {
    const kinds = planKinds(input);
    await ctx.trace(
      "search_tags",
      `business: ${input.businessType}`,
      async () => kinds,
      (value) => value.join(", "),
    );
    return kinds;
  }

  async discover(input: BusinessInput, resolved: ResolvedAnchor[], kind: PartnerKind, ctx: ProviderContext): Promise<Candidate[]> {
    return ctx.trace(
      "get_insights",
      `kind: ${kind}, city: ${input.city}`,
      async () => candidatesForKind(input, resolved, kind),
      (list) => `${kind} · ${list.length} candidates`,
    );
  }

  async score(input: BusinessInput, resolved: ResolvedAnchor[], candidates: Candidate[], ctx: ProviderContext): Promise<Partner[]> {
    return ctx.trace(
      "score_shortlist",
      `count: ${candidates.length}`,
      async () => scoreCandidates(input, resolved, candidates),
      (partners) => `${partners.length} scored`,
    );
  }

  async enrich(input: BusinessInput, partners: Partner[], ctx: ProviderContext): Promise<Partner[]> {
    const top = [...partners].sort((a, b) => b.matchScore - a.matchScore).slice(0, 12);
    await mapLimit(top, 3, (partner) =>
      ctx.trace(
        "get_trends",
        `entity: ${partner.name}`,
        async () => partner.evidence.find((item) => item.label === "Trend")?.value ?? "Steady",
        (value) => `${partner.name}: ${value}`,
      ),
    );
    void input;
    return partners;
  }

  async expand(run: RunResult, partnerId: string, ctx: ProviderContext): Promise<Partner[]> {
    const result = await ctx.trace(
      "get_insights",
      `expand: ${partnerId}`,
      async () => expandFrom(run, partnerId),
      (value) => `${value.added.length} added`,
    );
    return result.added;
  }

  async heatmap(run: RunResult, partnerId: string, ctx: ProviderContext): Promise<Heatmap | null> {
    return ctx.trace(
      "get_heatmap",
      `partner: ${partnerId}, city: ${run.input.city}`,
      async () => heatmapFor(run, partnerId),
      (value) => (value ? `${value.spots.length} neighbourhoods` : "no local map"),
    );
  }
}

export { cityFor };

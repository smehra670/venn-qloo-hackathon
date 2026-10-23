import type {
  BusinessInput,
  CityInfo,
  DiscoverSpec,
  Heatmap,
  Normalization,
  Partner,
  PartnerKind,
  ProviderName,
  RankEntry,
  ResolvedAnchor,
  RunResult,
} from "@shared/types";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CardsRequest, CardsResponse, RefillRequest, RefillResponse } from "@shared/schemas";
import { createSnapshotCardSource } from "../../anchors/cards.js";
import type { Candidate, ProviderContext, ProviderEntity, TasteProvider } from "../types.js";
import { hashInput } from "./hash.js";
import { latestSnapshotDate, snapshotDirPath } from "./manifest.js";

interface SnapshotFile {
  meta: { date: string; provider: string; exampleIndex: number; businessName?: string };
  result: RunResult;
}

/** True when a saved snapshot file exists on disk for this exact input (business type, city,
 * anchors). Lets callers (e.g. `getProvider()`'s `EXAMPLES_MODE=snapshot` replay) check before
 * committing to the snapshot provider, instead of catching `SnapshotNotFoundError`. */
export function hasSnapshot(input: BusinessInput): boolean {
  const hash = hashInput(input);
  return existsSync(path.join(snapshotDirPath(), `${hash}.json`));
}

export class SnapshotNotFoundError extends Error {
  constructor(input: BusinessInput) {
    super(
      `No saved result for "${input.city}" with these anchors. Try one of the example searches, or switch TASTE_PROVIDER away from snapshot.`,
    );
    this.name = "SnapshotNotFoundError";
  }
}

function partnerToEntry(partner: Partner): ProviderEntity {
  const parts = partner.locationLabel?.split(",").map((part) => part.trim());
  return {
    id: partner.id,
    name: partner.name,
    kind: partner.kind,
    entityType: partner.entityType,
    blurb: partner.blurb,
    tags: Object.fromEntries(partner.tags.map((tag) => [tag, 1])),
    audienceTags: partner.sharedTags,
    popularity: partner.signals.localPopularity,
    trend: partner.signals.trend,
    city: partner.local ? parts?.[parts.length - 1] : undefined,
    neighbourhood: parts && parts.length > 1 ? parts[0] : undefined,
  };
}

export class SnapshotTasteProvider implements TasteProvider {
  readonly name: ProviderName = "qloo";
  readonly label: string;

  private readonly cache = new Map<string, SnapshotFile | null>();

  /** Recorded decks for the example (business type, city) pairs; other pairs are unsupported. */
  private readonly cards = createSnapshotCardSource();

  getSwipeCards(req: CardsRequest): Promise<CardsResponse> {
    return this.cards.getSwipeCards(req);
  }

  getRefillCards(req: RefillRequest): Promise<RefillResponse> {
    return this.cards.getRefillCards(req);
  }

  constructor() {
    const date = latestSnapshotDate();
    this.label = date ? `Saved Qloo results · ${date}` : "Saved Qloo results";
  }

  private load(input: BusinessInput): SnapshotFile {
    const hash = hashInput(input);
    if (this.cache.has(hash)) {
      const cached = this.cache.get(hash);
      if (!cached) throw new SnapshotNotFoundError(input);
      return cached;
    }
    const file = path.join(snapshotDirPath(), `${hash}.json`);
    if (!existsSync(file)) {
      this.cache.set(hash, null);
      throw new SnapshotNotFoundError(input);
    }
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SnapshotFile;
    this.cache.set(hash, parsed);
    return parsed;
  }

  async resolveAnchors(input: BusinessInput, _ctx: ProviderContext): Promise<ResolvedAnchor[]> {
    return this.load(input).result.resolvedAnchors;
  }

  async resolveCity(input: BusinessInput, _ctx: ProviderContext): Promise<CityInfo | null> {
    return this.load(input).result.city;
  }

  async planKinds(input: BusinessInput, _resolved: ResolvedAnchor[], _ctx: ProviderContext): Promise<PartnerKind[]> {
    return this.load(input).result.plannedKinds;
  }

  async discover(
    input: BusinessInput,
    _resolved: ResolvedAnchor[],
    kind: PartnerKind,
    _ctx: ProviderContext,
    // Snapshots are a static replay of a past run, not a fresh call, so there is no request
    // shape to record — `out.spec` is deliberately left unset (see `rankTogether` below).
    _out?: { spec?: DiscoverSpec },
  ): Promise<Candidate[]> {
    const { result } = this.load(input);
    return result.partners
      .filter((partner) => partner.kind === kind)
      .map((partner) => ({
        entry: partnerToEntry(partner),
        local: partner.local,
        provisional: partner.matchScore / 100,
      }));
  }

  async score(
    input: BusinessInput,
    _resolved: ResolvedAnchor[],
    candidates: Candidate[],
    _ctx: ProviderContext,
    _out?: { normalization?: Normalization },
  ): Promise<Partner[]> {
    const { result } = this.load(input);
    const byId = new Map(result.partners.map((partner) => [partner.id, partner]));
    const seen = new Set<string>();
    const partners: Partner[] = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.entry.id)) continue;
      const partner = byId.get(candidate.entry.id);
      if (!partner) continue;
      seen.add(candidate.entry.id);
      partners.push({ ...partner, relatedIds: [...partner.relatedIds] });
    }
    partners.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
    return partners;
  }

  async enrich(_input: BusinessInput, partners: Partner[], _ctx: ProviderContext): Promise<Partner[]> {
    return partners;
  }

  async expand(_run: RunResult, _partnerId: string, _ctx: ProviderContext): Promise<Partner[]> {
    return [];
  }

  async heatmap(_run: RunResult, _partnerId: string, _ctx: ProviderContext): Promise<Heatmap | null> {
    return null;
  }

  async checkPartner(
    input: BusinessInput,
    _resolved: ResolvedAnchor[],
    query: { name: string; entityHint?: string },
    _frozen: { normalization: Normalization; medianScore: number },
    _ctx: ProviderContext,
  ): Promise<Partner | null> {
    // Snapshots are static: there's no live search/score to fall back to, so Check only
    // works for a partner already present in the saved result.
    const { result } = this.load(input);
    const needle = query.name.trim().toLowerCase();
    const match =
      result.partners.find((partner) => partner.name.toLowerCase() === needle) ??
      result.partners.find((partner) => partner.name.toLowerCase().includes(needle));
    if (!match) return null;
    return { ...match, relatedIds: [...match.relatedIds], userAdded: true };
  }

  /**
   * Snapshots have no live call to replay and `rankTogether`'s signature doesn't carry the
   * `BusinessInput` needed to look up which saved run's partners to read from — so this is
   * the "return empty with legacy note" branch: no `DiscoverSpec`s are ever recorded for this
   * provider either (see `discover` above), so Proof already knows to show its legacy message
   * rather than call this at all; this just keeps the contract honest if it is called anyway.
   */
  async rankTogether(_spec: DiscoverSpec, _extraEntityIds: string[], _ctx: ProviderContext): Promise<RankEntry[]> {
    return [];
  }
}

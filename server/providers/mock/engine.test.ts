import { PARTNER_KINDS, type BusinessInput, type DiscoverSpec } from "@shared/types";
import { describe, expect, it } from "vitest";
import { formatsFor } from "../../brief/template.js";
import { CATALOG } from "./catalog.js";
import { CITIES } from "./cities.js";
import {
  discoverSpecForKind,
  planKinds,
  rankTogetherMock,
  resolveCandidateEntry,
  resolveOne,
  scoreCandidates,
  candidatesForKind,
  limitsFor,
  cityFor,
} from "./engine.js";
import { PROFILES } from "./profiles.js";
import { SYNONYMS, TAXONOMY, isTag } from "./taxonomy.js";
import type { Candidate } from "../types.js";

const cafe: BusinessInput = {
  businessType: "cafe",
  city: "London",
  anchors: ["Aesop", "Radiohead", "pilates"],
  businessName: "Brew & Co",
};

function poolFor(input: BusinessInput): Candidate[] {
  const resolved = input.anchors.map((anchor) => resolveOne(anchor));
  const kinds = planKinds(input);
  return kinds.flatMap((kind, index) => candidatesForKind(input, resolved, kind).slice(0, index < 2 ? 4 : 3));
}

describe("mock taste data", () => {
  it("keeps every used tag inside the taxonomy", () => {
    expect(TAXONOMY).toHaveLength(52);
    expect(Object.keys(SYNONYMS).length).toBeGreaterThanOrEqual(80);
    const used = new Set<string>();
    for (const value of Object.values(SYNONYMS)) used.add(value);
    for (const profile of Object.values(PROFILES)) {
      for (const tag of profile.baseTags) used.add(tag);
    }
    for (const entry of CATALOG) {
      for (const tag of Object.keys(entry.tags)) used.add(tag);
      for (const tag of entry.audienceTags) used.add(tag);
    }
    for (const city of CITIES) {
      for (const area of city.neighbourhoods) {
        for (const tag of Object.keys(area.character)) used.add(tag);
      }
    }
    for (const tag of used) expect(isTag(tag)).toBe(true);
  });

  it("plans six kinds", () => {
    expect(planKinds(cafe)).toHaveLength(6);
  });

  it("scores deterministically inside 52 to 96 and skips local competitors", () => {
    const resolved = cafe.anchors.map((anchor) => resolveOne(anchor));
    const candidates = poolFor(cafe);
    const first = scoreCandidates(cafe, resolved, candidates);
    const second = scoreCandidates(cafe, resolved, candidates);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(12);
    for (const partner of first) {
      expect(partner.matchScore).toBeGreaterThanOrEqual(52);
      expect(partner.matchScore).toBeLessThanOrEqual(96);
      if (partner.local) expect(partner.kind).not.toBe("food");
    }
    expect(first.some((partner) => partner.local)).toBe(true);
  });

  it("returns no local places for an unknown city and explains the limit", () => {
    const input: BusinessInput = { businessType: "cafe", city: "Bristol", anchors: ["Aesop", "vinyl"] };
    const resolved = input.anchors.map((anchor) => resolveOne(anchor));
    const candidates = poolFor(input);
    const partners = scoreCandidates(input, resolved, candidates);
    expect(partners.every((partner) => !partner.local)).toBe(true);
    expect(cityFor(input)).toBeNull();
    expect(limitsFor(input).some((line) => line.includes("London, Manchester and New York"))).toBe(true);
    expect(limitsFor(input).some((line) => line.includes("group-level"))).toBe(true);
  });

  it("gives every kind three brief formats", () => {
    for (const kind of PARTNER_KINDS) {
      expect(new Set(formatsFor(kind)).size).toBe(3);
    }
  });

  it("matches known names and reads interests", () => {
    expect(resolveOne("Aesop").status).toBe("matched");
    expect(resolveOne("pilates").status).toBe("keyword");
    expect(resolveOne("zz-not-a-real-thing").status).toBe("guessed");
  });

  describe("rankTogetherMock (works entirely offline)", () => {
    it("builds a replayable DiscoverSpec whose params encode the audience profile", () => {
      const resolved = cafe.anchors.map((anchor) => resolveOne(anchor));
      const poolIds = CATALOG.filter((entry) => entry.kind === "retail").map((entry) => entry.id);
      const spec = discoverSpecForKind(cafe, resolved, "retail", poolIds);
      expect(spec.kind).toBe("retail");
      expect(spec.entityType).toBe("brand");
      expect(spec.poolIds).toEqual(poolIds);
      expect(spec.params["signal.audience"]).toBeTruthy();
      // Params are plain strings, so the spec is safe to persist as JSON on RunResult.
      for (const value of Object.values(spec.params)) expect(typeof value).toBe("string");
    });

    it("ranks the same pool deterministically every time, with no network access", () => {
      const resolved = cafe.anchors.map((anchor) => resolveOne(anchor));
      const poolIds = CATALOG.filter((entry) => entry.kind === "retail").map((entry) => entry.id);
      const spec = discoverSpecForKind(cafe, resolved, "retail", poolIds);

      const first = rankTogetherMock(spec, []);
      const second = rankTogetherMock(spec, []);
      expect(first).toEqual(second);
      expect(first.map((entry) => entry.entityId).sort()).toEqual([...poolIds].sort());
      for (const entry of first) {
        expect(entry.affinity).toBeGreaterThanOrEqual(0);
        expect(entry.affinity).toBeLessThanOrEqual(1);
      }
    });

    it("ranks a higher-overlap entity above an unrelated one for the same audience", () => {
      const resolved = cafe.anchors.map((anchor) => resolveOne(anchor));
      // Aesop (minimalist/skincare/design) overlaps the cafe's anchors far more than a
      // streetwear-leaning entry like Vans does.
      const spec: DiscoverSpec = discoverSpecForKind(cafe, resolved, "retail", ["aesop", "vans"]);
      const ranked = rankTogetherMock(spec, []);
      const aesop = ranked.find((entry) => entry.entityId === "aesop");
      const vans = ranked.find((entry) => entry.entityId === "vans");
      expect(aesop).toBeDefined();
      expect(vans).toBeDefined();
      expect(aesop!.affinity).toBeGreaterThan(vans!.affinity);
    });

    it("still ranks a synthetic 'Check a partner' id resolved earlier in the same process", () => {
      const resolved = cafe.anchors.map((anchor) => resolveOne(anchor));
      const synthetic = resolveCandidateEntry("Totally Not In The Demo Set Ltd");
      expect(synthetic.id).toMatch(/^custom-/);
      const spec = discoverSpecForKind(cafe, resolved, synthetic.kind, []);
      const ranked = rankTogetherMock(spec, [synthetic.id]);
      expect(ranked).toHaveLength(1);
      expect(ranked[0]?.entityId).toBe(synthetic.id);
    });
  });
});

import type { Partner } from "@shared/types";
import { describe, expect, it } from "vitest";
import { ABSOLUTE_NORMALIZATION, mutualAffinity, stretchWithNormalization } from "../scoring.js";
import type { QlooEntity } from "./client.js";
import { withCrowdTags } from "./index.js";
import { sharedTags, toProviderEntity } from "./mapping.js";
import {
  isCompetitorBrand,
  isCompetitorPlace,
  isExcludedBrand,
  isExcludedPlace,
  isGeneralInterestTag,
  matchesKindCategories,
  placeCategoryForTopic,
} from "./taxonomy.js";

const place = (name: string, ...categories: string[]): QlooEntity => ({
  entity_id: name,
  name,
  subtype: "urn:entity:place",
  tags: categories.map((slug) => ({ tag_id: `urn:tag:category:place:${slug}`, name: slug, type: "urn:tag:category:place" })),
});

const brand = (name: string, ...genres: string[]): QlooEntity => ({
  entity_id: name,
  name,
  subtype: "urn:entity:brand",
  tags: genres.map((slug) => ({ tag_id: `urn:tag:genre:brand:${slug}`, name: slug, type: "urn:tag:genre:brand" })),
});

describe("qloo taxonomy", () => {
  it("drops landmarks, stations and hotels but keeps real businesses", () => {
    expect(isExcludedPlace(place("The National Gallery", "tourist_attraction", "art_gallery"))).toBe(true);
    expect(isExcludedPlace(place("Piccadilly Circus", "subway_station"))).toBe(true);
    expect(isExcludedPlace(place("ibis London", "hotel"))).toBe(true);
    expect(isExcludedPlace(place("Rough Trade East", "live_music_venue", "bar"))).toBe(false);
  });

  it("drops banks, universities and charities as brand partners", () => {
    expect(isExcludedBrand(brand("Binance", "financial_services"))).toBe(true);
    expect(isExcludedBrand(brand("Loyola University", "academic"))).toBe(true);
    expect(isExcludedBrand(brand("Girls Who Code", "ngo", "ngo:education"))).toBe(true);
    expect(isExcludedBrand(brand("Rains", "fashion", "fashion:accessories"))).toBe(false);
    expect(isExcludedBrand(brand("Channel 4", "entertainment", "entertainment:tv_networks"))).toBe(true);
    expect(isExcludedBrand(brand("Kinfolk", "entertainment", "entertainment:media"))).toBe(false);
    const grocer: QlooEntity = { ...brand("Waitrose", "retail"), tags: [...(brand("Waitrose", "retail").tags ?? []), { tag_id: "urn:tag:industry:qloo:grocery", name: "Grocery" }] };
    expect(isExcludedBrand(grocer)).toBe(true);
  });

  it("flags a direct competitor by its main category only", () => {
    expect(isCompetitorPlace(place("Kaffeine", "cafe", "coffee_shop"), "cafe")).toBe(true);
    expect(isCompetitorPlace(place("Perilla", "korean_restaurant"), "restaurant")).toBe(true);
    // A bar that also serves food is not a restaurant's competitor.
    expect(isCompetitorPlace(place("Tortoise Supper Club", "bar", "restaurant"), "restaurant")).toBe(false);
    expect(isCompetitorPlace(place("Reckless Records", "record_store"), "cafe")).toBe(false);
    const waterstones: QlooEntity = { ...brand("Waterstones", "retail"), tags: [{ tag_id: "urn:tag:industry:qloo:books", name: "Books" }] };
    expect(isCompetitorBrand(waterstones, "bookshop")).toBe(true);
    expect(isCompetitorBrand(waterstones, "cafe")).toBe(false);
  });

  it("only labels a partner with a kind it actually belongs to", () => {
    expect(matchesKindCategories(place("Reckless Records", "record_store", "music_store"), "music", "place")).toBe(true);
    expect(matchesKindCategories(place("Poppies Fish & Chips", "fish_and_chips_takeaway"), "music", "place")).toBe(false);
    expect(matchesKindCategories(brand("Rains", "fashion:accessories"), "fashion", "brand")).toBe(true);
    expect(matchesKindCategories(brand("Oatly", "food_and_beverage"), "fashion", "brand")).toBe(false);
  });

  it("maps topics to the place category whose regulars share them", () => {
    expect(placeCategoryForTopic("yoga")).toBe("urn:tag:category:place:yoga_studio");
    expect(placeCategoryForTopic("natural wine")).toBe("urn:tag:category:place:wine_bar");
    expect(placeCategoryForTopic("vinyl records")).toBe("urn:tag:category:place:record_store");
    expect(placeCategoryForTopic("bouldering")).toBe("urn:tag:category:place:rock_climbing_gym");
    expect(placeCategoryForTopic("quantum physics")).toBeUndefined();
  });

  it("tells general-interest topics from brand-shaped tags", () => {
    expect(isGeneralInterestTag("urn:tag:activity_type:qloo:yoga")).toBe(true);
    expect(isGeneralInterestTag("urn:tag:genre:music:jazz")).toBe(true);
    expect(isGeneralInterestTag("urn:tag:similar_brand:qloo:patagonia")).toBe(false);
    expect(isGeneralInterestTag("urn:tag:competitor_brand:qloo:peloton")).toBe(false);
  });
});

describe("live scoring", () => {
  it("scores the mutual affinity on an absolute 0-100 scale", () => {
    expect(stretchWithNormalization(0.917, ABSOLUTE_NORMALIZATION)).toBe(92);
    // A popular brand whose crowd doesn't return the liking drops well below a true two-way fit.
    expect(Math.round(mutualAffinity(0.9, 0.55) * 100)).toBe(68);
    expect(Math.round(mutualAffinity(0.92, 0.915) * 100)).toBe(92);
    // Unmeasured reverse falls back to the forward affinity.
    expect(mutualAffinity(0.8, undefined)).toBeCloseTo(0.8);
  });

  it("never presents a partner's own tags as shared", () => {
    const entry = toProviderEntity({ entity_id: "p1", name: "Tate Modern", types: ["urn:entity:place"], tags: [{ name: "grand" }] }, "culture");
    expect(sharedTags([{ input: "Aesop", status: "matched", tags: [], note: "" }], entry!)).toEqual([]);
  });

  it("shares only your crowd's tastes that Qloo also tags the partner with", () => {
    const partner = {
      id: "rains",
      name: "Rains",
      sharedTags: [],
      reasons: ["placeholder", "second"],
      evidence: [{ label: "Shared tastes", value: "none", origin: "interpretation" }],
      signals: { affinityToPartner: 0.9, affinityFromPartner: 0.9, tagOverlap: 0, localPopularity: 0.5, trend: 0.5 },
    } as unknown as Partner;
    const profile = [
      { id: "t:slow", name: "Slow Living", affinity: 0.98 },
      { id: "t:cult", name: "Cultured", affinity: 0.97 },
      { id: "t:intel", name: "Intellectual", affinity: 0.96 },
    ];
    const updated = withCrowdTags(partner, profile, ["t:intel", "t:slow", "t:unrelated"]);
    expect(updated.sharedTags).toEqual(["Slow Living", "Intellectual"]);
    expect(updated.crowdTags?.filter((tag) => tag.onPartner).map((tag) => tag.label)).toEqual(["Slow Living", "Intellectual"]);
    expect(updated.crowdTags?.find((tag) => tag.label === "Cultured")?.onPartner).toBe(false);
    expect(updated.reasons[0]).toContain("slow living");
    expect(updated.evidence[0]?.origin).toBe("data");

    const none = withCrowdTags(partner, profile, ["t:unrelated"]);
    expect(none.sharedTags).toEqual([]);
  });
});

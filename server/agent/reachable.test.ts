import { describe, expect, it } from "vitest";
import type { Partner } from "@shared/types";
import {
  filterActionablePartners,
  isActionablePartner,
  looksLikeMediaOrContent,
  looksLikePublicLandmark,
} from "./reachable.js";

function partner(partial: Partial<Partner> & Pick<Partner, "id" | "name">): Partner {
  return {
    kind: "food",
    entityType: "place",
    blurb: "",
    local: true,
    matchScore: 80,
    surprise: 0.2,
    isSurprising: false,
    reasons: [],
    sharedTags: ["jazz"],
    tags: ["jazz"],
    signals: {
      affinityToPartner: 0.5,
      affinityFromPartner: 0.5,
      tagOverlap: 0.4,
      localPopularity: 0.5,
      trend: 0.5,
    },
    evidence: [],
    relatedIds: [],
    ...partial,
  };
}

describe("looksLikeMediaOrContent", () => {
  it("flags TV / magazine / platform names", () => {
    expect(looksLikeMediaOrContent("Food Network")).toBe(true);
    expect(looksLikeMediaOrContent("Food & Wine")).toBe(true);
    expect(looksLikeMediaOrContent("Food52")).toBe(true);
    expect(looksLikeMediaOrContent("Spotify")).toBe(true);
  });

  it("allows real venues and shops", () => {
    expect(looksLikeMediaOrContent("The Lantern Room")).toBe(false);
    expect(looksLikeMediaOrContent("Dalston Record Club")).toBe(false);
    expect(looksLikeMediaOrContent("Orchard Natural Wine")).toBe(false);
  });
});

describe("looksLikePublicLandmark", () => {
  it("flags parks and gardens", () => {
    expect(looksLikePublicLandmark("Hyde Park")).toBe(true);
    expect(looksLikePublicLandmark("Central Park")).toBe(true);
    expect(looksLikePublicLandmark("Kew Gardens")).toBe(true);
  });

  it("allows venues that aren't landmarks", () => {
    expect(looksLikePublicLandmark("The Lantern Room")).toBe(false);
    expect(looksLikePublicLandmark("Orchard Natural Wine")).toBe(false);
  });
});

describe("isActionablePartner", () => {
  it("keeps local places", () => {
    expect(
      isActionablePartner(partner({ id: "1", name: "The Lantern Room", local: true, entityType: "place" }), {
        hasLocalGeography: true,
      }),
    ).toBe(true);
  });

  it("drops distant places when the city has local geography", () => {
    expect(
      isActionablePartner(
        partner({ id: "2", name: "Jazz Lounge Music Club Chicago", local: false, entityType: "place" }),
        { hasLocalGeography: true, reach: "local_and_brands" },
      ),
    ).toBe(false);
  });

  it("drops media brands", () => {
    expect(
      isActionablePartner(partner({ id: "3", name: "Food Network", entityType: "brand", local: false, kind: "culture" })),
    ).toBe(false);
  });

  it("drops artists unless reach is anywhere", () => {
    const artist = partner({ id: "4", name: "Radiohead", entityType: "artist", kind: "music", local: false });
    expect(isActionablePartner(artist, { reach: "local_and_brands" })).toBe(false);
    expect(isActionablePartner(artist, { reach: "anywhere" })).toBe(true);
  });
});

describe("filterActionablePartners", () => {
  it("prioritises local places over media and distant clubs", () => {
    const pool = [
      partner({ id: "media", name: "Food & Wine", entityType: "brand", kind: "culture", local: false, matchScore: 96 }),
      partner({ id: "far", name: "Jazz Club Chicago", entityType: "place", local: false, matchScore: 90 }),
      partner({ id: "local", name: "The Lantern Room", entityType: "place", local: true, matchScore: 78, kind: "venue" }),
      partner({ id: "shop", name: "Dalston Record Club", entityType: "place", local: true, matchScore: 74, kind: "music" }),
    ];
    const { partners, removed, note } = filterActionablePartners(pool, undefined, { hasLocalGeography: true });
    expect(partners.map((p) => p.id)).toEqual(["local", "shop"]);
    expect(removed).toBe(2);
    expect(note).toMatch(/reach out|reachable/i);
  });
});

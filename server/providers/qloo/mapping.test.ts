import { describe, expect, it } from "vitest";
import {
  attachRelatedByAffinity,
  buildPartner,
  entityTypeFromUrns,
  filterTypeForKind,
  stretchScores,
  toProviderEntity,
} from "./mapping.js";
import type { QlooEntity } from "./client.js";
import type { Partner } from "@shared/types";

describe("qloo mapping", () => {
  it("maps partner kinds to Insights filter types", () => {
    expect(filterTypeForKind("music")).toBe("urn:entity:artist");
    expect(filterTypeForKind("retail")).toBe("urn:entity:brand");
    expect(filterTypeForKind("fashion")).toBe("urn:entity:brand");
    expect(filterTypeForKind("food")).toBe("urn:entity:place");
    expect(filterTypeForKind("wellness")).toBe("urn:entity:brand");
  });

  it("reads entity types from URN lists", () => {
    expect(entityTypeFromUrns(["urn:entity:artist"])).toBe("artist");
    expect(entityTypeFromUrns(["urn:entity:brand"])).toBe("brand");
    expect(entityTypeFromUrns(["urn:entity:place"])).toBe("place");
  });

  it("stretches affinities into the 52–96 score band", () => {
    expect(stretchScores([0.1, 0.5, 0.9])).toEqual([52, 74, 96]);
    expect(stretchScores([0.4, 0.4, 0.4])).toEqual([74, 74, 74]);
    expect(stretchScores([])).toEqual([]);
  });

  it("builds a ProviderEntity from a Qloo payload", () => {
    const entity: QlooEntity = {
      entity_id: "abc-123",
      name: "Aesop",
      types: ["urn:entity:brand"],
      affinity: 0.82,
      tags: [{ name: "Minimalist" }, { name: "Skincare" }],
      popularity: 0.7,
      short_description: "Quiet stores and plain packaging.",
    };
    const entry = toProviderEntity(entity, "retail", "London");
    expect(entry).toMatchObject({
      id: "abc-123",
      name: "Aesop",
      kind: "retail",
      entityType: "brand",
      city: "London",
    });
    expect(entry?.blurb).toContain("Quiet stores");
    expect(Object.keys(entry?.tags ?? {}).length).toBeGreaterThan(0);
  });

  it("builds partners with honest evidence origins and related ids", () => {
    const entry = toProviderEntity(
      {
        entity_id: "p1",
        name: "Aesop",
        types: ["urn:entity:brand"],
        affinity: 0.9,
        tags: [{ name: "Skincare" }],
      },
      "retail",
    );
    expect(entry).not.toBeNull();
    const partner = buildPartner({
      entry: entry!,
      local: false,
      affinityTo: 0.9,
      affinityFrom: 0.7,
      matchScore: 90,
      resolved: [{ input: "Aesop", status: "matched", tags: ["skincare"], note: "" }],
      input: { businessType: "cafe", city: "London", anchors: ["Aesop"] },
      median: 70,
    });
    expect(partner.matchScore).toBe(90);
    expect(partner.evidence.some((item) => item.origin === "data")).toBe(true);
    expect(partner.evidence.some((item) => item.origin === "interpretation")).toBe(true);

    const other: Partner = {
      ...partner,
      id: "p2",
      name: "Other",
      relatedIds: [],
    };
    const first = { ...partner, relatedIds: [] };
    attachRelatedByAffinity([first, other]);
    expect(first.relatedIds).toContain("p2");
  });
});

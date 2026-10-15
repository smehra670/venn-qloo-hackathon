import { describe, expect, it } from "vitest";
import {
  attachRelatedByAffinity,
  buildPartner,
  entityTypeFromUrns,
  explainabilityAnchor,
  filterTypeForKind,
  httpUrlOnly,
  isClosedPlace,
  stretchScores,
  toProviderEntity,
  venueFactsFromEntity,
} from "./mapping.js";
import type { QlooEntity } from "./client.js";
import type { Partner, ResolvedAnchor } from "@shared/types";

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

  it("drops closed places entirely rather than surfacing is_closed", () => {
    const closed: QlooEntity = {
      entity_id: "closed-1",
      name: "Shuttered Cafe",
      types: ["urn:entity:place"],
      properties: { is_closed: true, address: "1 Old St" },
      location: { lat: 51.5, lon: -0.1 },
    };
    expect(isClosedPlace(closed)).toBe(true);
    expect(toProviderEntity(closed, "food")).toBeNull();

    const open: QlooEntity = {
      ...closed,
      entity_id: "open-1",
      name: "Open Cafe",
      properties: { is_closed: false, address: "2 New St" },
    };
    expect(isClosedPlace(open)).toBe(false);
    expect(toProviderEntity(open, "food")).not.toBeNull();

    const unspecified: QlooEntity = { ...closed, entity_id: "unspecified-1", properties: { address: "3 Mid St" } };
    expect(isClosedPlace(unspecified)).toBe(false);
  });

  it("accepts only http(s) venue websites, dropping everything else", () => {
    expect(httpUrlOnly("https://example.com")).toBe("https://example.com");
    expect(httpUrlOnly("http://example.com")).toBe("http://example.com");
    expect(httpUrlOnly("ftp://example.com")).toBeUndefined();
    expect(httpUrlOnly("mailto:hi@example.com")).toBeUndefined();
    expect(httpUrlOnly("javascript:alert(1)")).toBeUndefined();
    expect(httpUrlOnly("example.com")).toBeUndefined();
    expect(httpUrlOnly("")).toBeUndefined();
    expect(httpUrlOnly(undefined)).toBeUndefined();
    expect(httpUrlOnly(42)).toBeUndefined();
  });

  it("extracts VenueFacts from a place entity, dropping is_closed and keeping distanceM/website", () => {
    const entity: QlooEntity = {
      entity_id: "place-1",
      name: "Maison Bertaux",
      types: ["urn:entity:place"],
      properties: {
        address: "28 Greek St London W1D 5DQ",
        website: "http://www.maisonbertaux.com/",
        is_closed: false,
        neighborhood: "Soho",
      },
      location: { lat: 51.5133448, lon: -0.13021 },
      query: { affinity: 0.77, distance: 706.74 },
    };
    const facts = venueFactsFromEntity(entity);
    expect(facts).toEqual({
      lat: 51.5133448,
      lon: -0.13021,
      address: "28 Greek St London W1D 5DQ",
      neighbourhood: "Soho",
      website: "http://www.maisonbertaux.com/",
      distanceM: 707,
    });
    expect(facts).not.toHaveProperty("is_closed");
  });

  it("returns undefined VenueFacts without a usable coordinate", () => {
    const entity: QlooEntity = { entity_id: "no-geo", name: "No Geo", properties: {} };
    expect(venueFactsFromEntity(entity)).toBeUndefined();
  });

  it("maps a candidate's explainability payload to a matched anchor's name", () => {
    const resolved: ResolvedAnchor[] = [
      { input: "Aesop", status: "matched", entityId: "anchor-1", entityName: "Aesop", tags: [], note: "" },
      { input: "vinyl", status: "keyword", tags: ["vinyl"], note: "" },
    ];
    const entity: QlooEntity = {
      entity_id: "candidate-1",
      name: "Candidate",
      query: {
        affinity: 0.5,
        explainability: {
          "signal.interests.entities": [
            { entity_id: "anchor-1", score: 0.8 },
            { entity_id: "unrelated-entity", score: 0.3 },
          ],
        },
      },
    };
    const result = explainabilityAnchor(entity, resolved);
    expect(result).toEqual({ anchorName: "Aesop", score: 0.8 });
  });

  it("returns null explainability when the top entity isn't a matched anchor", () => {
    const resolved: ResolvedAnchor[] = [
      { input: "Aesop", status: "matched", entityId: "anchor-1", entityName: "Aesop", tags: [], note: "" },
    ];
    const entity: QlooEntity = {
      entity_id: "candidate-1",
      name: "Candidate",
      query: { explainability: { "signal.interests.entities": [{ entity_id: "someone-else", score: 0.9 }] } },
    };
    expect(explainabilityAnchor(entity, resolved)).toBeNull();
    expect(explainabilityAnchor({ entity_id: "no-explain", name: "x" }, resolved)).toBeNull();
  });
});

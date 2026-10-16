import { describe, expect, it } from "vitest";
import {
  classifyTasteAnchorStatus,
  isBroadAnchorWord,
  nameSimilarity,
  normaliseAnchorText,
} from "./status.js";

describe("normaliseAnchorText / isBroadAnchorWord", () => {
  it("normalises whitespace and case", () => {
    expect(normaliseAnchorText("  Jazz Music ")).toBe("jazz music");
  });

  it("flags broad words", () => {
    expect(isBroadAnchorWord("Food")).toBe(true);
    expect(isBroadAnchorWord("Music")).toBe(true);
    expect(isBroadAnchorWord("Jazz Music")).toBe(false);
    expect(isBroadAnchorWord("Aesop")).toBe(false);
  });
});

describe("nameSimilarity", () => {
  it("is 1 for identical strings", () => {
    expect(nameSimilarity("Jazz", "jazz")).toBe(1);
  });

  it("scores close phrases highly", () => {
    expect(nameSimilarity("Jazz Music", "jazz")).toBeGreaterThanOrEqual(0.7);
  });
});

describe("classifyTasteAnchorStatus", () => {
  it("Food → too_broad", () => {
    expect(
      classifyTasteAnchorStatus({
        normalisedInput: "food",
        entityScores: [0.9],
        topicScores: [1],
      }),
    ).toBe("too_broad");
  });

  it("clear entity ≥ 0.85 → entity", () => {
    expect(
      classifyTasteAnchorStatus({
        normalisedInput: "radiohead",
        entityScores: [0.95],
        topicScores: [],
      }),
    ).toBe("entity");
  });

  it("Aesop-style close entity pair → ambiguous", () => {
    expect(
      classifyTasteAnchorStatus({
        normalisedInput: "aesop",
        entityScores: [1, 1],
        topicScores: [],
      }),
    ).toBe("ambiguous");
  });

  it("Jazz Music with strong topic → topic", () => {
    expect(
      classifyTasteAnchorStatus({
        normalisedInput: "jazz music",
        entityScores: [0.4],
        topicScores: [0.95, 0.7],
      }),
    ).toBe("topic");
  });

  it("several close topics → ambiguous", () => {
    expect(
      classifyTasteAnchorStatus({
        normalisedInput: "natural wine",
        entityScores: [],
        topicScores: [0.92, 0.9],
      }),
    ).toBe("ambiguous");
  });

  it("nothing above floor → unresolved", () => {
    expect(
      classifyTasteAnchorStatus({
        normalisedInput: "zzqxnotareal",
        entityScores: [0.4],
        topicScores: [0.35],
      }),
    ).toBe("unresolved");
  });

  it("high tag-signal overlap → too_broad", () => {
    expect(
      classifyTasteAnchorStatus({
        normalisedInput: "specialty coffee",
        entityScores: [],
        topicScores: [0.9],
        tagSignalOverlap: 0.85,
      }),
    ).toBe("too_broad");
  });
});

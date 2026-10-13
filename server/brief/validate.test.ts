import { describe, expect, it } from "vitest";
import type { FactPack } from "./facts.js";
import { validateLlmPayload } from "./validate.js";

function makeFactPack(): FactPack {
  return {
    business: { name: "Brew & Co", type: "Cafe", city: "London", anchors: ["Aesop"] },
    partner: {
      name: "Aesop",
      kind: "retail",
      local: true,
      locationLabel: "Shoreditch, London",
      sharedTags: ["minimalist"],
      tags: ["minimalist", "skincare"],
      matchScore: 88,
      surprise: 0.4,
    },
    signals: { affinityToPartner: 0.8, affinityFromPartner: 0.7, tagOverlap: 0.6, localPopularity: 0.5, trend: 0.3 },
    evidence: [
      { id: "ev-0", label: "Shared tags", value: "minimalist", origin: "data" },
      { id: "ev-1", label: "Taste fit", value: "80%", origin: "data" },
    ],
    formatHint: "Listening night",
  };
}

const basePayload = {
  title: "A pilot with Aesop",
  format: "Pilot",
  concept: "A small shared test.",
  firstStep: "Send a note.",
  plan: [{ when: "Day 1", action: "Agree a date." }],
  measure: ["Attendance"],
  risks: ["It might not land."],
  outreach: { subject: "Hello", body: "Hi there." },
};

describe("validateLlmPayload", () => {
  it("passes when every citation exists in the fact pack", () => {
    const result = validateLlmPayload(
      { ...basePayload, whyItFits: [{ text: "Shared taste.", evidenceIds: ["ev-0", "ev-1"] }] },
      makeFactPack(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an evidence id that does not exist in the fact pack", () => {
    const result = validateLlmPayload(
      { ...basePayload, whyItFits: [{ text: "Shared taste.", evidenceIds: ["ev-99"] }] },
      makeFactPack(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain("ev-99");
    }
  });

  it("rejects malformed JSON that does not match the brief shape", () => {
    const result = validateLlmPayload({ title: "Missing everything else" }, makeFactPack());
    expect(result.ok).toBe(false);
  });
});

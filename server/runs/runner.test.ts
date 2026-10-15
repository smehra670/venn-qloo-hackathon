import type { BusinessInput, StoredEvent } from "@shared/types";
import { describe, expect, it } from "vitest";
import { executeRun } from "./runner.js";
import { createRun } from "./store.js";

const inputWithGoals: BusinessInput = {
  businessType: "cafe",
  city: "London",
  anchors: ["Aesop", "Radiohead", "pilates"],
  goals: { wants: ["new_audience"], reach: "near", appetite: "medium", avoid: [] },
};

const inputWithoutGoals: BusinessInput = {
  businessType: "cafe",
  city: "London",
  anchors: ["Aesop", "Radiohead", "pilates"],
};

function decisionsOf(events: StoredEvent[]): Extract<StoredEvent, { type: "decision" }>[] {
  return events.filter((event): event is Extract<StoredEvent, { type: "decision" }> => event.type === "decision");
}

describe("executeRun decision log", () => {
  it("appends decision events (live) and persists them on the result (for reload)", async () => {
    const run = createRun(inputWithGoals);
    await executeRun(run, () => {});

    expect(run.status).toBe("done");
    const decisionEvents = decisionsOf(run.events);
    expect(decisionEvents.length).toBeGreaterThan(0);
    expect(decisionEvents.some((event) => event.decision.toLowerCase().includes("fine-tune"))).toBe(true);
    // Every decision event names a step, so the "how Venn decided" panel can group them.
    for (const event of decisionEvents) {
      expect(typeof event.decision).toBe("string");
      expect(typeof event.reason).toBe("string");
    }

    expect(run.result?.decisions?.length).toBeGreaterThan(0);
    expect(run.result?.decisions?.length).toBe(decisionEvents.length);
  });

  it("applies goalFit to partners without changing matchScore when goals are set", async () => {
    const run = createRun(inputWithGoals);
    await executeRun(run, () => {});

    const partners = run.result?.partners ?? [];
    expect(partners.length).toBeGreaterThan(0);
    expect(partners.every((partner) => typeof partner.goalFit === "number")).toBe(true);
    for (const partner of partners) {
      expect(partner.matchScore).toBeGreaterThanOrEqual(52);
      expect(partner.matchScore).toBeLessThanOrEqual(96);
    }
  });

  it("still logs process decisions (e.g. search coverage) when no goals are set", async () => {
    const run = createRun(inputWithoutGoals);
    await executeRun(run, () => {});

    expect(run.status).toBe("done");
    expect(decisionsOf(run.events).length).toBeGreaterThan(0);
    expect(run.result?.partners.every((partner) => partner.goalFit === undefined)).toBe(true);
  });

  it("attaches feasibility only to top-pick partners", async () => {
    const run = createRun(inputWithoutGoals);
    await executeRun(run, () => {});

    const result = run.result;
    expect(result).toBeDefined();
    if (!result) return;
    const pickedIds = new Set(result.topPicks.map((pick) => pick.partnerId));
    for (const partner of result.partners) {
      if (pickedIds.has(partner.id)) {
        expect(partner.feasibility).toBeDefined();
      } else {
        expect(partner.feasibility).toBeUndefined();
      }
    }
  });
});

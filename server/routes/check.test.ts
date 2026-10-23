import { MAX_USER_ADDED_PARTNERS } from "@shared/constants";
import type { Partner, RunResult } from "@shared/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { EXAMPLES } from "./health.js";

type App = Awaited<ReturnType<typeof buildApp>>;

// One shared app for the whole file: closing it tears down the module-level sqlite store
// (shared by every `buildApp()` call within this test file), which would break any run
// started afterwards, so we only close it once after all tests have run.
let app: App;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

async function createDoneRun(): Promise<{ runId: string; result: RunResult }> {
  const example = EXAMPLES[0];
  if (!example) throw new Error("No example configured.");
  // One extra anchor keeps this close to the real example input but off its exact hash, so it
  // runs through the normal mock pipeline rather than `EXAMPLES_MODE=snapshot`'s example replay
  // (see `getProvider()`) — this test is about frozen-normalization behavior, not examples.
  const input = { ...example, anchors: [...example.anchors, "vinyl"] };
  const created = await app.inject({ method: "POST", url: "/api/runs", payload: input });
  const { runId } = created.json() as { runId: string };
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
    const payload = current.json() as { status: string; result?: RunResult; error?: string };
    if (payload.status === "done" && payload.result) return { runId, result: payload.result };
    if (payload.status === "error") throw new Error(payload.error ?? "run failed");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Run did not finish in time.");
}

describe("check-a-partner endpoint", () => {
  it("freezes the run's normalization so the run can re-score a candidate", async () => {
    const { result } = await createDoneRun();
    expect(result.normalization).toBeDefined();
    expect(result.normalization?.maxRaw).toBeGreaterThanOrEqual(result.normalization?.minRaw ?? 0);
  });

  it("adds a checked partner as a dashed, user-added pick and caps at the configured limit", async () => {
    const { runId } = await createDoneRun();

    // Fictional names guaranteed not to fuzzy-match the demo catalog, so each check adds a
    // distinct synthetic, user-added partner rather than colliding with an existing one.
    const names = Array.from({ length: MAX_USER_ADDED_PARTNERS + 1 }, (_, index) => `Zzyx Studio Number ${index}`);

    const statuses: number[] = [];
    for (const name of names) {
      const response = await app.inject({ method: "POST", url: `/api/runs/${runId}/check`, payload: { name } });
      statuses.push(response.statusCode);
      if (response.statusCode === 200) {
        const body = response.json() as { partner: Partner };
        expect(body.partner.userAdded).toBe(true);
      }
    }

    expect(statuses.slice(0, MAX_USER_ADDED_PARTNERS)).toEqual(Array(MAX_USER_ADDED_PARTNERS).fill(200));
    expect(statuses.at(-1)).toBe(400);

    const final = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
    const finalResult = (final.json() as { result: RunResult }).result;
    expect(finalResult.partners.filter((partner) => partner.userAdded).length).toBe(MAX_USER_ADDED_PARTNERS);
  });

  it("returns the existing partner without duplicating when checked twice", async () => {
    const { runId } = await createDoneRun();
    const first = await app.inject({ method: "POST", url: `/api/runs/${runId}/check`, payload: { name: "Zzyx Repeat" } });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as { partner: Partner };

    const second = await app.inject({ method: "POST", url: `/api/runs/${runId}/check`, payload: { name: "Zzyx Repeat" } });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as { partner: Partner; message?: string };
    expect(secondBody.partner.id).toBe(firstBody.partner.id);
    expect(secondBody.message).toContain("already in this search");

    const final = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
    const finalResult = (final.json() as { result: RunResult }).result;
    expect(finalResult.partners.filter((partner) => partner.id === firstBody.partner.id)).toHaveLength(1);
  });
});

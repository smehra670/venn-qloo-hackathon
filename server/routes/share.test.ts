import type { RunResult } from "@shared/types";
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
  const created = await app.inject({ method: "POST", url: "/api/runs", payload: example });
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

describe("share links", () => {
  it("creates a token and resolves it to a read-only result", async () => {
    const { runId, result } = await createDoneRun();

    const shareResponse = await app.inject({ method: "POST", url: `/api/runs/${runId}/share` });
    expect(shareResponse.statusCode).toBe(200);
    const { token, expiresAt } = shareResponse.json() as { token: string; expiresAt: number };
    expect(token.length).toBeGreaterThan(10);
    expect(expiresAt).toBeGreaterThan(Date.now());

    const getResponse = await app.inject({ method: "GET", url: `/api/share/${token}` });
    expect(getResponse.statusCode).toBe(200);
    const body = getResponse.json() as { result: RunResult };
    expect(body.result.runId).toBe(result.runId);
    expect(body.result.partners.length).toBe(result.partners.length);
  });

  it("404s for an unknown token", async () => {
    const response = await app.inject({ method: "GET", url: "/api/share/does-not-exist" });
    expect(response.statusCode).toBe(404);
  });

  it("409s when the run has not finished yet", async () => {
    const example = EXAMPLES[0];
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: example });
    const { runId } = created.json() as { runId: string };
    const response = await app.inject({ method: "POST", url: `/api/runs/${runId}/share` });
    expect(response.statusCode).toBe(409);
  });
});

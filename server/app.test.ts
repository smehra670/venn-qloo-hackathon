import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { EXAMPLES } from "./routes/health.js";

describe("runs api", () => {
  it("finishes a london cafe search", async () => {
    const app = await buildApp();
    const example = EXAMPLES[0];
    expect(example).toBeDefined();
    const created = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: example,
    });
    expect(created.statusCode).toBe(200);
    const body = created.json() as { runId: string };
    expect(body.runId).toBeTruthy();

    let status = "running";
    let partners = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = await app.inject({ method: "GET", url: `/api/runs/${body.runId}` });
      const payload = current.json() as { status: string; result?: { partners: unknown[]; topPicks: unknown[] } };
      status = payload.status;
      if (status === "done" && payload.result) {
        partners = payload.result.partners.length;
        expect(payload.result.topPicks.length).toBe(3);
        break;
      }
      if (status === "error") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(status).toBe("done");
    expect(partners).toBeGreaterThanOrEqual(12);

    const done = await app.inject({ method: "GET", url: `/api/runs/${body.runId}` });
    const result = done.json() as { result: { partners: { id: string }[]; topPicks: { partnerId: string }[] } };
    const partnerId = result.result.topPicks[0]?.partnerId ?? result.result.partners[0]?.id;
    expect(partnerId).toBeTruthy();
    const heatmap = await app.inject({ method: "GET", url: `/api/runs/${body.runId}/heatmap?partnerId=${partnerId}` });
    expect(heatmap.statusCode).toBe(200);
    const brief = await app.inject({
      method: "POST",
      url: `/api/runs/${body.runId}/brief`,
      payload: { partnerId, variant: 0 },
    });
    expect(brief.statusCode).toBe(200);
    const briefBody = brief.json() as { variantCount: number; generatedBy: string };
    expect(briefBody.variantCount).toBe(3);
    expect(briefBody.generatedBy).toBe("template");
    await app.close();
  });
});

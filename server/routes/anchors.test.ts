import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("POST /api/anchors/resolve (mock)", () => {
  it("resolves a clean anchor as auto and the ambiguous Aesop fixture as ambiguous", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/anchors/resolve",
      payload: { anchors: ["Radiohead", "Aesop"], city: "London" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { input: string; status: string; candidates: { entityName: string }[] }[];
    expect(body).toHaveLength(2);
    expect(body[0]?.input).toBe("Radiohead");
    expect(body[0]?.status).toBe("auto");
    expect(body[1]?.input).toBe("Aesop");
    expect(body[1]?.status).toBe("ambiguous");
    expect(body[1]?.candidates.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it("rejects an empty anchors list", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/anchors/resolve", payload: { anchors: [] } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

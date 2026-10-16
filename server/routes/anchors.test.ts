import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("POST /api/anchors/resolve (mock)", () => {
  it("resolves Radiohead as entity and Aesop as ambiguous", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/anchors/resolve",
      payload: { anchors: ["Radiohead", "Aesop"], city: "London", skipAi: true },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{
      input: string;
      status: string;
      entityCandidates: { name: string }[];
      selected?: { name: string; kind: string };
    }>;
    expect(body).toHaveLength(2);
    expect(body[0]?.input).toBe("Radiohead");
    expect(body[0]?.status).toBe("entity");
    expect(body[0]?.selected?.kind).toBe("entity");
    expect(body[1]?.input).toBe("Aesop");
    expect(body[1]?.status).toBe("ambiguous");
    expect(body[1]?.entityCandidates.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it("resolves Jazz Music as a topic tag", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/anchors/resolve",
      payload: { anchors: ["Jazz Music"], city: "London", skipAi: true },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{
      status: string;
      selected?: { kind: string; id: string; name: string };
      topicCandidates: { name: string }[];
    }>;
    expect(body[0]?.status).toBe("topic");
    expect(body[0]?.selected?.kind).toBe("tag");
    expect(body[0]?.topicCandidates.some((c) => /jazz/i.test(c.name))).toBe(true);
    await app.close();
  });

  it("marks Food as too_broad", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/anchors/resolve",
      payload: { anchors: ["Food"], city: "London", skipAi: true },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ status: string }>;
    expect(body[0]?.status).toBe("too_broad");
    await app.close();
  });

  it("rejects an empty anchors list", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/anchors/resolve", payload: { anchors: [] } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

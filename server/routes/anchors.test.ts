import { CardsResponse, RefillResponse } from "@shared/schemas";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { config } from "../config.js";

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

  it("rejects an empty anchors list (resolve)", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/anchors/resolve", payload: { anchors: [] } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /api/anchors/cards and /cards/refill (mock)", () => {
  it("returns a sample deck that validates", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/anchors/cards", payload: { businessType: "cafe", city: "Manchester" } });
    expect(response.statusCode).toBe(200);
    const body = CardsResponse.parse(response.json());
    expect(body.status).toBe("ok");
    expect(body.cards.every((card) => card.provenance === "sample")).toBe(true);
    await app.close();
  });

  it("refills from a liked card", async () => {
    const app = await buildApp();
    const deck = CardsResponse.parse(
      (await app.inject({ method: "POST", url: "/api/anchors/cards", payload: { businessType: "bar", city: "London" } })).json(),
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/anchors/cards/refill",
      payload: { businessType: "bar", city: "London", likedIds: [deck.cards[0]!.anchor.id], excludeIds: deck.cards.map((c) => c.id) },
    });
    expect(response.statusCode).toBe(200);
    expect(RefillResponse.parse(response.json()).status).toBe("ok");
    await app.close();
  });

  it("rejects invalid bodies with a 400 and a plain message", async () => {
    const app = await buildApp();
    for (const [url, payload] of [
      ["/api/anchors/cards", { businessType: "spaceport", city: "London" }],
      ["/api/anchors/cards", { businessType: "cafe" }],
      ["/api/anchors/cards/refill", { businessType: "cafe", city: "London", likedIds: [], excludeIds: [] }],
      ["/api/anchors/cards/refill", { businessType: "cafe", city: "London", likedIds: ["a"] }],
    ] as const) {
      const response = await app.inject({ method: "POST", url, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/^[A-Z][^{}]+\.$/);
    }
    await app.close();
  });

  it("never logs the request body", async () => {
    const app = await buildApp();
    const out = vi.spyOn(process.stdout, "write");
    const log = vi.spyOn(console, "log");
    const info = vi.spyOn(console, "info");
    await app.inject({ method: "POST", url: "/api/anchors/cards", payload: { businessType: "cafe", city: "Zzyzxville" } });
    const printed = [...out.mock.calls, ...log.mock.calls, ...info.mock.calls].map((call) => String(call[0])).join("\n");
    expect(printed).not.toContain("Zzyzxville");
    vi.restoreAllMocks();
    await app.close();
  });

  it("sits under the same rate limiter as every other route", async () => {
    const app = await buildApp();
    let last = 200;
    for (let i = 0; i <= config.rateLimitMax && last !== 429; i += 1) {
      last = (await app.inject({ method: "POST", url: "/api/anchors/cards", payload: { businessType: "cafe", city: "London" } })).statusCode;
    }
    expect(last).toBe(429);
    await app.close();
  });
});

describe("POST /api/anchors/resolve validation", () => {
  it("rejects an empty anchors list", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/anchors/resolve", payload: { anchors: [] } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

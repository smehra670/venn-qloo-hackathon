import { anchorEntityType, shortAnchorType } from "@shared/anchorType";
import { CardsResponse, RunResultSchema } from "@shared/schemas";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { resolveAnchors as mockResolve } from "../providers/mock/engine.js";
import { QlooTasteProvider } from "../providers/qloo/index.js";
import { createMockCardSource, createSnapshotCardSource } from "./cards.js";

const SHORT = new Set(["brand", "artist", "place", "topic"]);

describe("swiped anchors run exactly like typed ones", () => {
  it("normalises anchor types to the short form the typed resolver uses", () => {
    expect(shortAnchorType("urn:entity:brand")).toBe("brand");
    expect(shortAnchorType("tag")).toBe("topic");
    expect(shortAnchorType("artist")).toBe("artist");
    expect(anchorEntityType("urn:entity:place")).toBe("place");
    expect(anchorEntityType("topic")).toBeUndefined();
  });

  it("every card source emits short anchor types", async () => {
    const mock = await createMockCardSource().getSwipeCards({ businessType: "cafe", city: "London" });
    const snap = await createSnapshotCardSource().getSwipeCards({ businessType: "cafe", city: "London" });
    for (const card of [...mock.cards, ...snap.cards]) expect(SHORT.has(card.anchor.type)).toBe(true);
  });

  it("a long-form type from older saved input still resolves to a valid entity type", () => {
    const resolved = mockResolve({
      businessType: "cafe",
      city: "London",
      anchors: ["Aesop"],
      tasteAnchors: [{ name: "Aesop", kind: "entity", id: "abc", type: "urn:entity:brand", origin: "user" }],
    });
    expect(resolved[0]?.entityType).toBe("brand");
  });

  it("the live provider turns a long-form anchor type into a valid entity type (no Qloo call)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("no network in tests"))));
    const provider = new QlooTasteProvider();
    const ctx = {
      signal: new AbortController().signal,
      trace: <T,>(_tool: string, _args: string, fn: () => Promise<T>) => fn(),
      decide: () => {},
    };
    const resolved = await provider.resolveAnchors(
      {
        businessType: "cafe",
        city: "London",
        anchors: ["Aesop", "Joy Division"],
        tasteAnchors: [
          { name: "Aesop", kind: "entity", id: "32F867B9-E6DF-44C3-BCE4-40160C7ED5E4", type: "urn:entity:brand", origin: "user" },
          { name: "Joy Division", kind: "entity", id: "J0Y", type: "artist", origin: "user" },
        ],
      },
      ctx,
    );
    expect(resolved.map((anchor) => anchor.entityType)).toEqual(["brand", "artist"]);
    vi.unstubAllGlobals();
  });

  it("a run started from swiped cards finishes with a result the client schema accepts", async () => {
    const app = await buildApp();
    const deck = CardsResponse.parse(
      (await app.inject({ method: "POST", url: "/api/anchors/cards", payload: { businessType: "cafe", city: "London" } })).json(),
    );
    const picks = deck.cards.filter((card) => ["brand", "artist", "place", "topic"].includes(card.kind)).slice(0, 4);
    const created = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        businessType: "cafe",
        city: "London",
        anchors: picks.map((card) => card.name),
        tasteAnchors: picks.map((card) => ({ name: card.name, kind: card.anchor.kind, id: card.anchor.id, type: card.anchor.type, origin: "user" })),
      },
    });
    expect(created.statusCode).toBe(200);
    const { runId } = created.json() as { runId: string };
    let body: { status: string; result?: unknown } = { status: "running" };
    for (let i = 0; i < 100 && body.status !== "done" && body.status !== "error"; i += 1) {
      body = (await app.inject({ method: "GET", url: `/api/runs/${runId}` })).json();
      if (body.status !== "done") await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(body.status).toBe("done");
    const parsed = RunResultSchema.safeParse(body.result);
    expect(parsed.success ? "valid" : JSON.stringify(parsed.error.issues.slice(0, 2))).toBe("valid");
    await app.close();
  });
});

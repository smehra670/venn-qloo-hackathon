import type { DiscoverSpec } from "@shared/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderContext } from "../types.js";
import { QlooTasteProvider } from "./index.js";

function makeCtx(): ProviderContext {
  return {
    signal: new AbortController().signal,
    async trace(_tool, _args, fn) {
      return fn();
    },
    decide() {
      // no-op: these tests don't inspect the decision log
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Qloo rankTogether request building", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replays the spec's params plus filter.type and filter.results.entities for pool+extra ids", async () => {
    const calls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        calls.push(new URL(url));
        return jsonResponse({ success: true, results: { entities: [] } });
      }),
    );
    const provider = new QlooTasteProvider();
    const spec: DiscoverSpec = {
      kind: "retail",
      entityType: "brand",
      params: { "signal.interests.entities": "anchor-1,anchor-2", take: "12" },
      poolIds: ["id-1", "id-2"],
    };

    await provider.rankTogether(spec, ["id-3"], makeCtx());

    expect(calls).toHaveLength(1);
    const url = calls[0]!;
    expect(url.pathname).toBe("/v2/insights");
    // filter.type is replayed from the spec's entityType, not from spec.params.
    expect(url.searchParams.get("filter.type")).toBe("urn:entity:brand");
    // Pool ids plus the extra id, in one rank-together call.
    expect(url.searchParams.get("filter.results.entities")).toBe("id-1,id-2,id-3");
    // The original discover call's signal is replayed unchanged.
    expect(url.searchParams.get("signal.interests.entities")).toBe("anchor-1,anchor-2");
    // take is overridden to the ids being ranked, not the original pool-fetch size.
    expect(url.searchParams.get("take")).toBe("3");
  });

  it("chunks more than 20 ids into separate calls and merges the results", async () => {
    const calls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        calls.push(new URL(url));
        return jsonResponse({ success: true, results: { entities: [] } });
      }),
    );
    const provider = new QlooTasteProvider();
    const poolIds = Array.from({ length: 25 }, (_, index) => `id-${index}`);
    const spec: DiscoverSpec = { kind: "food", entityType: "place", params: {}, poolIds };

    await provider.rankTogether(spec, [], makeCtx());

    expect(calls).toHaveLength(2);
    expect(calls[0]!.searchParams.get("filter.results.entities")?.split(",")).toHaveLength(20);
    expect(calls[1]!.searchParams.get("filter.results.entities")?.split(",")).toHaveLength(5);
  });

  it("returns one RankEntry per id Qloo could place, reading affinity and popularity from that call only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          success: true,
          results: {
            entities: [
              { entity_id: "id-1", name: "One", query: { affinity: 0.7 }, popularity: 0.4 },
              { entity_id: "id-2", name: "Two", affinity: 0.3, popularity: 0.9 },
            ],
          },
        }),
      ),
    );
    const provider = new QlooTasteProvider();
    const spec: DiscoverSpec = { kind: "food", entityType: "place", params: {}, poolIds: ["id-1", "id-2", "id-3"] };

    const ranked = await provider.rankTogether(spec, [], makeCtx());

    expect(ranked).toHaveLength(2); // id-3 wasn't in the response, so it's simply omitted.
    expect(ranked).toEqual(
      expect.arrayContaining([
        { entityId: "id-1", affinity: 0.7, popularity: 0.4 },
        { entityId: "id-2", affinity: 0.3, popularity: 0.9 },
      ]),
    );
  });

  it("returns an empty list without throwing when the pool and extras are both empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new QlooTasteProvider();
    const spec: DiscoverSpec = { kind: "food", entityType: "place", params: {}, poolIds: [] };

    const ranked = await provider.rankTogether(spec, [], makeCtx());

    expect(ranked).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

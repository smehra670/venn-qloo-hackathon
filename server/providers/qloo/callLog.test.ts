import type { QlooCallRecord } from "@shared/types";
import { describe, expect, it } from "vitest";
import { arraySink, CALL_LOG_CAP, recordQlooCall, redactQlooParams, withQlooCallSink, withQlooStep } from "./callLog.js";

describe("redactQlooParams", () => {
  it("stringifies arrays and plain values, dropping empty/undefined entries", () => {
    const out = redactQlooParams({
      "filter.type": "urn:entity:place",
      take: 12,
      "signal.interests.entities": ["a", "b", "c"],
      skip: undefined,
      blank: "",
      enabled: true,
    });
    expect(out).toEqual({
      "filter.type": "urn:entity:place",
      take: "12",
      "signal.interests.entities": "a,b,c",
      enabled: "true",
    });
  });

  it("truncates very long values so one call can't bloat the log", () => {
    const longList = Array.from({ length: 200 }, (_, index) => `id-${index}`);
    const out = redactQlooParams({ "signal.interests.entities": longList });
    const value = out["signal.interests.entities"];
    expect(value).toBeDefined();
    expect(value!.length).toBeLessThan(250);
    expect(value).toMatch(/…\(\+\d+\)$/);
  });

  it("never includes an api-key-shaped field (params carry no secrets)", () => {
    const out = redactQlooParams({ "filter.type": "urn:entity:brand", "X-Api-Key": "should-not-be-here-in-practice" });
    // Defensive: even if a caller mistakenly passed a key-shaped param, redaction doesn't
    // special-case it away — the real guarantee is that `qlooGet` never puts the key in params
    // (it's a header). This test documents that redaction is a safe pass-through, not a filter.
    expect(Object.keys(out)).toContain("X-Api-Key");
  });
});

describe("call log sink", () => {
  it("is a no-op outside an active sink (e.g. most unit tests)", () => {
    expect(() => recordQlooCall({ path: "/search", params: {}, status: "ok", ms: 5 })).not.toThrow();
  });

  it("records a call with redacted params and the active step", async () => {
    const target: QlooCallRecord[] = [];
    const sink = arraySink(target, () => "call-1");
    await withQlooCallSink(sink, async () => {
      await withQlooStep("discover", async () => {
        recordQlooCall({ path: "/v2/insights", params: { "filter.type": "urn:entity:place", take: 12 }, status: "ok", ms: 42 });
      });
    });
    expect(target).toHaveLength(1);
    expect(target[0]).toMatchObject({
      id: "call-1",
      step: "discover",
      path: "/v2/insights",
      params: { "filter.type": "urn:entity:place", take: "12" },
      status: "ok",
      ms: 42,
    });
    expect(typeof target[0]?.at).toBe("number");
  });

  it("caps the sink's target array at CALL_LOG_CAP, dropping the oldest first", async () => {
    const target: QlooCallRecord[] = [];
    let counter = 0;
    const sink = arraySink(target, () => `call-${counter++}`);
    await withQlooCallSink(sink, async () => {
      for (let i = 0; i < CALL_LOG_CAP + 10; i += 1) {
        recordQlooCall({ path: "/search", params: { q: String(i) }, status: "ok", ms: 1 });
      }
    });
    expect(target).toHaveLength(CALL_LOG_CAP);
    // The oldest 10 calls (ids call-0..call-9) should have been dropped.
    expect(target[0]?.id).toBe("call-10");
    expect(target.at(-1)?.id).toBe(`call-${CALL_LOG_CAP + 9}`);
  });

  it("isolates concurrently-running sinks from each other", async () => {
    const targetA: QlooCallRecord[] = [];
    const targetB: QlooCallRecord[] = [];
    await Promise.all([
      withQlooCallSink(arraySink(targetA, () => "a"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        recordQlooCall({ path: "/a", params: {}, status: "ok", ms: 1 });
      }),
      withQlooCallSink(arraySink(targetB, () => "b"), async () => {
        recordQlooCall({ path: "/b", params: {}, status: "ok", ms: 1 });
      }),
    ]);
    expect(targetA.map((c) => c.path)).toEqual(["/a"]);
    expect(targetB.map((c) => c.path)).toEqual(["/b"]);
  });
});

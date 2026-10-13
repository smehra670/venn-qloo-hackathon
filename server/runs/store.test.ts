import type { BusinessInput } from "@shared/types";
import { describe, expect, it } from "vitest";
import { append, canStartRun, createRun, getRun, getStoreStats, hashIp, recordRun } from "./store.js";

const input: BusinessInput = { businessType: "cafe", city: "London", anchors: ["Aesop"] };

describe("run store", () => {
  it("creates and retrieves a run", () => {
    const run = createRun(input);
    expect(run.status).toBe("running");
    expect(getRun(run.id)?.id).toBe(run.id);
  });

  it("returns undefined for an unknown id", () => {
    expect(getRun("does-not-exist")).toBeUndefined();
  });

  it("updates status via append and keeps event history", () => {
    const run = createRun(input);
    append(run, { type: "step_started", step: "resolve", title: "Looking" });
    append(run, { type: "error", message: "boom" });
    expect(run.status).toBe("error");
    expect(run.error).toBe("boom");
    expect(run.events).toHaveLength(2);
  });

  it("hashes ips deterministically without leaking the raw value", () => {
    const a = hashIp("203.0.113.5");
    const b = hashIp("203.0.113.5");
    const c = hashIp("203.0.113.6");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("203.0.113");
  });

  it("enforces the daily per-ip run cap", () => {
    const ip = `test-ip-${Math.random()}`;
    expect(canStartRun(ip)).toBe(true);
    for (let i = 0; i < 40; i += 1) recordRun(ip);
    expect(canStartRun(ip)).toBe(false);
  });

  it("reports store stats for the health route", () => {
    const stats = getStoreStats();
    expect(stats.type).toBe("sqlite");
    expect(stats.memoryRuns).toBeGreaterThanOrEqual(0);
    expect(stats.dbRuns).toBeGreaterThanOrEqual(0);
  });
});

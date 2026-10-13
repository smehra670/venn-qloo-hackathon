import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("health route", () => {
  it("reports today's usage counts and exposes a usage history endpoint", async () => {
    const app = await buildApp();

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    const healthBody = health.json() as { usage: { qlooToday: number; llmToday: number } };
    expect(healthBody.usage).toBeDefined();
    expect(healthBody.usage.qlooToday).toBeGreaterThanOrEqual(0);
    expect(healthBody.usage.llmToday).toBeGreaterThanOrEqual(0);

    const usage = await app.inject({ method: "GET", url: "/api/usage" });
    expect(usage.statusCode).toBe(200);
    const usageBody = usage.json() as { qlooToday: number; llmToday: number; history: unknown[] };
    expect(usageBody.qlooToday).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(usageBody.history)).toBe(true);

    await app.close();
  });
});

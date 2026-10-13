import { describe, expect, it } from "vitest";
import { getUsageHistory, getUsageSummary, recordUsage } from "./ledger.js";

describe("usage ledger", () => {
  it("increments today's qloo count", () => {
    const before = getUsageSummary().qlooToday;
    recordUsage("qloo");
    recordUsage("qloo");
    expect(getUsageSummary().qlooToday).toBe(before + 2);
  });

  it("increments today's llm count independently of qloo", () => {
    const before = getUsageSummary();
    recordUsage("llm");
    const after = getUsageSummary();
    expect(after.llmToday).toBe(before.llmToday + 1);
    expect(after.qlooToday).toBe(before.qlooToday);
  });

  it("surfaces today's totals in the history window", () => {
    recordUsage("qloo");
    const history = getUsageHistory();
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = history.find((row) => row.day === today);
    expect(todayRow).toBeDefined();
    expect(todayRow?.qloo).toBeGreaterThan(0);
  });
});

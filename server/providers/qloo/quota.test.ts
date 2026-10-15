import { describe, expect, it } from "vitest";
import { isQuotaBelowFloorValue, parseQuotaRemaining } from "./client.js";

describe("qloo quota helpers", () => {
  it("parses the x-month-ratelimit-remaining header", () => {
    expect(parseQuotaRemaining("500")).toBe(500);
    expect(parseQuotaRemaining("0")).toBe(0);
    expect(parseQuotaRemaining(null)).toBeNull();
    expect(parseQuotaRemaining("not-a-number")).toBeNull();
    expect(parseQuotaRemaining("")).toBeNull();
  });

  it("is never below floor before any quota has been reported", () => {
    expect(isQuotaBelowFloorValue(null, 500)).toBe(false);
  });

  it("flags quota below the configured floor", () => {
    expect(isQuotaBelowFloorValue(499, 500)).toBe(true);
    expect(isQuotaBelowFloorValue(500, 500)).toBe(false);
    expect(isQuotaBelowFloorValue(501, 500)).toBe(false);
    expect(isQuotaBelowFloorValue(0, 500)).toBe(true);
  });
});

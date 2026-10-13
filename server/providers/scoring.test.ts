import { describe, expect, it } from "vitest";
import { computeNormalization, SCORE_FLAT, SCORE_MAX, SCORE_MIN, stretchWithNormalization } from "./scoring.js";

describe("frozen score helper", () => {
  it("maps the same raw value to the same score for a frozen normalization", () => {
    const normalization = { minRaw: 0.1, maxRaw: 0.9 };
    const first = stretchWithNormalization(0.5, normalization);
    const second = stretchWithNormalization(0.5, normalization);
    expect(first).toBe(second);
    expect(first).toBe(74);
  });

  it("stays comparable to the frozen band even for a candidate outside the original raw range", () => {
    const normalization = { minRaw: 0.2, maxRaw: 0.6 };
    expect(stretchWithNormalization(0.2, normalization)).toBe(SCORE_MIN);
    expect(stretchWithNormalization(0.6, normalization)).toBe(SCORE_MAX);
    // Clamped rather than exceeding the band when a fresh candidate scores outside it.
    expect(stretchWithNormalization(0.9, normalization)).toBe(SCORE_MAX);
    expect(stretchWithNormalization(-0.2, normalization)).toBe(SCORE_MIN);
  });

  it("falls back to the flat midpoint when every raw value in the batch ties", () => {
    const normalization = computeNormalization([0.42, 0.42, 0.42]);
    expect(stretchWithNormalization(0.42, normalization)).toBe(SCORE_FLAT);
  });

  it("computeNormalization captures the min/max of a batch, or a safe default when empty", () => {
    expect(computeNormalization([0.1, 0.5, 0.9])).toEqual({ minRaw: 0.1, maxRaw: 0.9 });
    expect(computeNormalization([])).toEqual({ minRaw: 0, maxRaw: 1 });
  });
});

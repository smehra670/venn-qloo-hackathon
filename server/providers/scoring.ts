import type { Normalization } from "@shared/types";
import { clamp } from "../utils/text.js";

/** The UI's match-score band. Every provider stretches raw [0,1]-ish affinity into this range. */
export const SCORE_MIN = 52;
export const SCORE_MAX = 96;
/** Used when every raw score in a batch ties, so there is no range to stretch across. */
export const SCORE_FLAT = 74;

/** Captures the min/max of a batch of raw scores so they can be frozen onto a `RunResult`. */
export function computeNormalization(raw: number[]): Normalization {
  if (raw.length === 0) return { minRaw: 0, maxRaw: 1 };
  return { minRaw: Math.min(...raw), maxRaw: Math.max(...raw) };
}

/**
 * Maps a raw affinity score into the 52-96 UI band using a normalization captured earlier
 * (typically from the run's initial scoring pass). This is the shared "frozen normalisation"
 * helper: Proof and Check-a-partner call it with the run's frozen `minRaw`/`maxRaw` instead of
 * recomputing a fresh band from whatever small candidate set they happen to be scoring, so a
 * re-scored candidate lands on the same scale as the partners already shown for that run.
 *
 * Passing the same `raw` value and the same `normalization` always returns the same score.
 */
export function stretchWithNormalization(raw: number, normalization: Normalization): number {
  const { minRaw, maxRaw } = normalization;
  if (maxRaw - minRaw < 1e-9) return SCORE_FLAT;
  const score = SCORE_MIN + ((raw - minRaw) / (maxRaw - minRaw)) * (SCORE_MAX - SCORE_MIN);
  return Math.round(clamp(score, SCORE_MIN, SCORE_MAX));
}

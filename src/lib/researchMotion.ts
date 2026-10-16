import { STEP_TITLES } from "@shared/constants";
import { STEP_ORDER, type StepId } from "@shared/types";

export const RESEARCH_STEP_ORDER = STEP_ORDER;
export const RESEARCH_STEP_TITLES = STEP_TITLES;

/** Minimum time each visual step stays on screen (ms). */
export const RESEARCH_STEP_MIN_MS = 900;

export function stepIndex(step: StepId | null | undefined): number {
  if (!step) return -1;
  return RESEARCH_STEP_ORDER.indexOf(step);
}

export function progressPercent(
  visualStep: StepId | null,
  done: boolean,
  localProgress = 0,
): number {
  if (done) return 100;
  const idx = stepIndex(visualStep);
  if (idx < 0) return 0;
  return Math.round(((idx + Math.min(1, Math.max(0, localProgress))) / RESEARCH_STEP_ORDER.length) * 100);
}

/** Ease-out cubic — arrivals. */
export function easeOut(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return 1 - (1 - t) ** 3;
}

/** Ease in-out cubic — camera. */
export function easeInOut(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** MapLibre zoom so a circle of `radiusM` fills `fill` of the shorter viewport side. */
export function zoomForRing(
  lat: number,
  radiusM: number,
  mapWidth: number,
  mapHeight: number,
  fill = 0.84,
): number {
  const minSide = Math.max(1, Math.min(mapWidth, mapHeight));
  const targetDiameterPx = fill * minSide;
  const metersPerPx = (2 * radiusM) / targetDiameterPx;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  return Math.log2((156543.03392 * cosLat) / metersPerPx);
}

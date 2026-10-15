import type { Partner } from "@shared/types";

export interface LiftPoint {
  id: string;
  popularity: number;
  affinity: number;
}

/**
 * Residual of an ordinary-least-squares fit of `affinity ~ popularity` across one batch of
 * points: for each point, how much more (positive) or less (negative) taste affinity it has
 * than a straight line through popularity alone would predict. "Taste lift" — a partner that's
 * locally unpopular but still has strong forward/reverse affinity to your anchors lifts above
 * the line; a partner that's only here because it's popular sits near or below it.
 *
 * Pure and deterministic: same points in, same residuals out, always keyed by `id`. Degenerate
 * batches (fewer than 2 points, or popularity with no variance to regress against) fall back to
 * "residual = affinity minus the batch's mean affinity" so every id still gets a number instead
 * of an arbitrary one.
 */
export function computePopularityLift(points: LiftPoint[]): Map<string, number> {
  const residuals = new Map<string, number>();
  if (points.length === 0) return residuals;

  const meanX = points.reduce((sum, point) => sum + point.popularity, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.affinity, 0) / points.length;

  if (points.length < 2) {
    for (const point of points) residuals.set(point.id, 0);
    return residuals;
  }

  let covXY = 0;
  let varX = 0;
  for (const point of points) {
    const dx = point.popularity - meanX;
    covXY += dx * (point.affinity - meanY);
    varX += dx * dx;
  }

  // No popularity variance to regress against (e.g. every candidate came from the same
  // discover call with identical popularity) — fall back to the deviation from mean affinity
  // instead of a slope that would be undefined (0/0).
  const slope = varX > 1e-9 ? covXY / varX : 0;
  const intercept = meanY - slope * meanX;

  for (const point of points) {
    const predicted = intercept + slope * point.popularity;
    residuals.set(point.id, point.affinity - predicted);
  }
  return residuals;
}

/**
 * Computes `popularityLift` for every partner in `partners` as one batch (see
 * `computePopularityLift`) using each partner's existing `affinityToPartner`/`localPopularity`
 * signals — no new provider calls. Returns a new array; never touches `matchScore`. Safe to
 * call repeatedly as the batch changes (new run, expand, check-a-partner): the residual is only
 * meaningful relative to the batch it was computed from, so it's recomputed in full each time
 * rather than patched incrementally.
 */
export function applyPopularityLift(partners: Partner[]): Partner[] {
  if (partners.length === 0) return partners;
  const points: LiftPoint[] = partners.map((partner) => ({
    id: partner.id,
    popularity: partner.signals.localPopularity,
    affinity: partner.signals.affinityToPartner,
  }));
  const residuals = computePopularityLift(points);
  return partners.map((partner) => ({
    ...partner,
    popularityLift: residuals.get(partner.id) ?? 0,
  }));
}

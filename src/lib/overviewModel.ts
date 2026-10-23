import type { Partner, PartnerKind, RunResult } from "@shared/types";
import { clamp } from "@/lib/format";
import { KIND_META } from "@/lib/kinds";

export const OVERVIEW_MAX = 12;

export type OverviewKindFilter = PartnerKind | "all";

/** Match score as 0–1 for charts (matchScore is typically 52–96). */
export function score01(partner: Partner): number {
  return clamp(partner.matchScore / 100, 0.05, 0.99);
}

/** Overlap fraction for orbit lens maths — same band as the reference sample. */
export function overlapFraction(partner: Partner): number {
  return clamp((score01(partner) - 0.35) / 0.62, 0.06, 0.97);
}

export function rankOf(partner: Partner, surprise: number): number {
  return (1 - surprise) * partner.matchScore + surprise * (0.5 * partner.matchScore + 50 * partner.surprise);
}

export function safeScore(partner: Partner): number {
  return 0.75 * score01(partner) + 0.25 * easeOf(partner);
}

export function wildScore(partner: Partner): number {
  return 0.5 * score01(partner) + 0.5 * partner.surprise;
}

export function rankScore(partner: Partner, surprise: number): number {
  return (1 - surprise) * safeScore(partner) + surprise * wildScore(partner);
}

/** Venn's estimate of how easy the partner is to approach (not Qloo). */
export function easeOf(partner: Partner): number {
  const band = partner.feasibility?.level;
  const base = band === "easy" ? 0.78 : band === "warm_intro" ? 0.55 : band === "long_shot" ? 0.32 : 0.5;
  const dist = partner.venueFacts?.distanceM;
  if (typeof dist === "number" && Number.isFinite(dist)) {
    const near = clamp(1 - dist / 8000, 0, 1);
    return clamp(0.65 * base + 0.35 * near, 0.08, 0.95);
  }
  if (!partner.local) return clamp(base * 0.82, 0.08, 0.95);
  return base;
}

export function yAxisValue(partner: Partner, surprise: number): number {
  return (1 - surprise) * easeOf(partner) + surprise * partner.surprise;
}

export type ReachLevel = "easy" | "warm" | "long";

export function reachLevel(partner: Partner): ReachLevel {
  const e = easeOf(partner);
  if (e >= 0.65) return "easy";
  if (e >= 0.45) return "warm";
  return "long";
}

export const REACH_LABEL: Record<ReachLevel, string> = {
  easy: "Easy to reach",
  warm: "Warm intro",
  long: "Long shot",
};

/** Bubble radius from Qloo popularity only when scoreBasis.popularity is present. */
export function popularityRadius(partner: Partner, min = 17, span = 15): number {
  const pop = partner.scoreBasis?.popularity;
  if (typeof pop === "number" && Number.isFinite(pop)) {
    return min + clamp(pop, 0, 1) * span;
  }
  return min + span * 0.45;
}

export function hasQlooPopularity(partner: Partner): boolean {
  return typeof partner.scoreBasis?.popularity === "number";
}

/** Every partner on the Overview is the same blue: kind is shown by labels and filter chips,
 * and plum is reserved for shared taste. */
export const PARTNER_BLUE = "#4F5BFF";

/** Partner colour by kind (drawer and shortlist; the Overview uses `PARTNER_BLUE`). */
export function kindColor(kind: PartnerKind): string {
  return KIND_META[kind]?.color ?? "#4F5BFF";
}

export function kindLabel(kind: PartnerKind): string {
  return KIND_META[kind]?.label ?? kind;
}

export function firstMessageIdea(partner: Partner, youLabel: string): string {
  // Only claim a shared taste when one was actually measured (never the partner's own tags).
  const theme = partner.sharedTags[0];
  if (theme) {
    return `Lead with ${theme.toLowerCase()} — both ${youLabel}'s crowd and ${partner.name}'s rate it highly. Propose one small joint next step.`;
  }
  const driver = partner.drivers?.[0];
  if (driver) {
    return `People who love ${driver.anchor} also rate ${partner.name} highly — open with that shared crowd, then propose one small joint next step.`;
  }
  return `Open with one specific observation about ${partner.name}, then propose a single shared next step that fits both crowds.`;
}

export function filterPartners(
  partners: Partner[],
  opts: { kind: OverviewKindFilter; realistic: boolean; surprise: number },
): Partner[] {
  return partners
    .filter((p) => (opts.kind === "all" || p.kind === opts.kind) && (!opts.realistic || reachLevel(p) !== "long"))
    .sort((a, b) => rankScore(b, opts.surprise) - rankScore(a, opts.surprise));
}

export function kindCounts(partners: Partner[]): { kind: PartnerKind; count: number }[] {
  const map = new Map<PartnerKind, number>();
  for (const p of partners) map.set(p.kind, (map.get(p.kind) ?? 0) + 1);
  return [...map.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

/**
 * Shared tastes for "why they match": the measured crowd tags both sides rate highly, with
 * Qloo's real affinity for each crowd. Partners without crowd scores (mock/snapshot runs) fall
 * back to their shared tags with no numbers — never invented percentages.
 */
export function topThemes(partner: Partner, limit = 3): { name: string; you?: number; them?: number }[] {
  if (partner.crowdTags && partner.crowdTags.length > 0) {
    const byLabel = new Map(partner.crowdTags.map((tag) => [tag.label, tag]));
    return partner.sharedTags.slice(0, limit).map((name) => {
      const tag = byLabel.get(name);
      return { name, you: tag?.you, them: tag?.them };
    });
  }
  return partner.sharedTags.slice(0, limit).map((name) => ({ name }));
}

/** Circle–circle intersection area (reference `inter`). */
export function circleIntersect(R: number, r: number, d: number): number {
  if (d >= R + r) return 0;
  if (d <= Math.abs(R - r)) return Math.PI * Math.min(R, r) ** 2;
  const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r));
  const b = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R));
  const c = 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
  return a + b - c;
}

/** Distance so lens / partner-disk area ≈ fraction `f` (reference `distFor`). */
export function distFor(f: number, R: number, r: number): number {
  let lo = Math.abs(R - r);
  let hi = R + r;
  const target = clamp(f, 0.05, 0.98);
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    if (circleIntersect(R, r, mid) / (Math.PI * r * r) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function prefersStaticMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("static") === "1") return true;
  } catch {
    /* ignore */
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function pct(v: number): number {
  return Math.round(clamp(v, 0, 1) * 100);
}

export function heroCopy(result: RunResult, visible: Partner[]): { title: string; lede: string } {
  const top = [...visible].sort((a, b) => b.matchScore - a.matchScore)[0];
  const kinds = new Set(visible.map((p) => p.kind)).size;
  const anchors = result.input.anchors.slice(0, 2);
  const anchorText =
    anchors.length === 0
      ? "your anchors"
      : anchors.length === 1
        ? anchors[0]!
        : `${anchors[0]} and ${anchors[1]}`;
  const title = top
    ? `${top.name} is your strongest overlap. Venn found ${visible.length} partner${visible.length === 1 ? "" : "s"} across ${kinds} kind${kinds === 1 ? "" : "s"}.`
    : `Venn found ${visible.length} partners for this search.`;
  const lede = `Ranked from Qloo taste data for ${anchorText} in ${result.input.city}. Click any dot, bar or card and it follows that partner through every chart.`;
  return { title, lede };
}

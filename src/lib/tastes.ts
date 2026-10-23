import type { Partner, RunResult } from "@shared/types";
import { score01 } from "@/lib/overviewModel";

/**
 * Shared tastes for the Overview ("taste magnets"): one selector that the tray, tooltips,
 * tables, orbit, scatter, map and flow all read, so every chart shows the same numbers.
 *
 * A taste is one of the shared taste themes in the flow's middle column: a crowd tag that both
 * your crowd and the partner's carry (`partner.sharedTags`). Membership comes from Qloo. A
 * strength only exists on live Qloo runs where Qloo scored each shared tag for the partner's own
 * crowd (`crowdTags[].them`); a partner's weight for a taste is then that tag's share of those
 * affinities. Otherwise (mock, snapshot, or live without partner-side scores) a taste is
 * membership only, and no percentage is ever shown.
 */
export interface Taste {
  id: string;
  name: string;
  /** partnerId -> weight. With strength: share of that partner's match flowing through this
   * taste (0..1). Without: 1 for every member. Absent or 0: not a member. */
  weights: Record<string, number>;
  hasStrength: boolean;
}

export const TRAY_MAX = 6;
const MIN_MEMBERS = 2;

export const tasteId = (name: string): string =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Sentence case for display ("Vinyl and live music"). */
export const tasteName = (label: string): string => {
  const trimmed = label.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
};

/** True when tag strengths may be shown: live Qloo only (snapshot replays and mock never). */
export function runHasStrength(result: Pick<RunResult, "provider" | "providerLabel"> | null | undefined): boolean {
  return Boolean(result && result.provider === "qloo" && !/^saved/i.test(result.providerLabel));
}

/**
 * The partner crowd's own Qloo affinity for this tag, or null. Only a partner-specific number
 * counts as a strength: your crowd's affinity (`you`) is the same for every partner, so splitting
 * it across a partner's tags would invent a "share" (one shared tag would always read 100%).
 */
function affinityOf(partner: Partner, label: string): number | null {
  const tag = partner.crowdTags?.find((item) => item.label === label);
  const value = tag?.them;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Every shared taste across `partners`, with per-partner weights. */
export function allTastes(partners: readonly Partner[], live: boolean): Taste[] {
  const byId = new Map<string, Taste>();
  for (const partner of partners) {
    const labels = [...new Set(partner.sharedTags)];
    const affinities = labels.map((label) => affinityOf(partner, label));
    const strength = live && affinities.length > 0 && affinities.every((value) => value !== null);
    const total = strength ? affinities.reduce<number>((sum, value) => sum + (value ?? 0), 0) : 0;
    labels.forEach((label, i) => {
      const id = tasteId(label);
      if (!id) return;
      const taste = byId.get(id) ?? { id, name: tasteName(label), weights: {}, hasStrength: true };
      taste.weights[partner.id] = strength ? (affinities[i] ?? 0) / total : 1;
      if (!strength) taste.hasStrength = false;
      byId.set(id, taste);
    });
  }
  return [...byId.values()].map((taste) => (live ? taste : { ...taste, hasStrength: false }));
}

export const membersOf = (taste: Taste, vis: readonly Partner[]): Partner[] => vis.filter((p) => (taste.weights[p.id] ?? 0) > 0);

/** Sum over members of score × weight: how much of the visible match runs through the taste. */
export function totalFlow(taste: Taste, vis: readonly Partner[]): number {
  return membersOf(taste, vis).reduce((sum, p) => sum + score01(p) * (taste.weights[p.id] ?? 0), 0);
}

/**
 * The tray: tastes with at least 2 members among the visible partners (after the filter row),
 * strongest total flow first, at most 6. Recompute whenever the filters change.
 */
export function selectTastes(vis: readonly Partner[], live: boolean): Taste[] {
  return allTastes(vis, live)
    .filter((taste) => membersOf(taste, vis).length >= MIN_MEMBERS)
    .sort((a, b) => totalFlow(b, vis) - totalFlow(a, vis) || a.name.localeCompare(b.name))
    .slice(0, TRAY_MAX);
}

/** Members strongest first (by weight, then overlap score). */
export function rankedMembers(taste: Taste, vis: readonly Partner[]): Partner[] {
  return membersOf(taste, vis).sort((a, b) => (taste.weights[b.id] ?? 0) - (taste.weights[a.id] ?? 0) || b.matchScore - a.matchScore);
}

/** Live-region sentence for a pinned taste. */
export function tasteAnnouncement(taste: Taste | null, vis: readonly Partner[]): string {
  if (!taste) return "Taste focus cleared.";
  const members = rankedMembers(taste, vis);
  const strongest = taste.hasStrength && members[0] ? `, strongest is ${members[0].name}` : "";
  return `${taste.name}. ${members.length} partners share it${strongest}.`;
}

/** Tooltip / table text for one partner and the focused taste, or null for non-members. */
export function tasteLine(taste: Taste, partner: Partner): string | null {
  const weight = taste.weights[partner.id] ?? 0;
  if (weight <= 0) return null;
  return taste.hasStrength ? `${taste.name}: ${Math.round(weight * 100)}% of their match` : `${taste.name}: they share it`;
}

export function tasteCell(taste: Taste, partner: Partner): string {
  const weight = taste.weights[partner.id] ?? 0;
  if (weight <= 0) return "No";
  return taste.hasStrength ? `${Math.round(weight * 100)}% of match` : "Shares it";
}

// ------------------------------------------------------------------ pull maths (pure)

export interface Point {
  x: number;
  y: number;
}

export interface PullMember {
  id: string;
  /** Honest position (distance from you = overlap). */
  x: number;
  y: number;
  r: number;
  weight: number;
}

export interface PullResult {
  /** The magnet clamped into the chart (30px margin). */
  c: Point;
  /** 1 inside the chart, fading to 0 within 90px outside it. */
  inside: number;
  /** Final positions (lerp of honest and pulled by `inside`) and normalised strength per member. */
  pos: Record<string, Point & { s: number }>;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Where the members of a held taste go (port of `applyPull` in the reference). With strengths a
 * stronger link sits closer to the magnet (about 46px plus its radius for the strongest, up to
 * about 196px for the weakest) and nobody is pushed further than they already were. Without
 * strengths members sit evenly on a ring around the magnet, so distance means nothing. Overlaps
 * are resolved in 14 passes. Non-members are not part of the input and never move.
 */
export function computePull(opts: {
  members: readonly PullMember[];
  magnet: Point;
  viewBox: { x0: number; y0: number; x1: number; y1: number };
  hasStrength: boolean;
}): PullResult {
  const { members, magnet: m, viewBox: vb } = opts;
  const c = { x: clamp(m.x, vb.x0 + 30, vb.x1 - 30), y: clamp(m.y, vb.y0 + 30, vb.y1 - 30) };
  const inside = clamp(1 - Math.hypot(m.x - c.x, m.y - c.y) / 90);
  const maxW = Math.max(0.01, ...members.map((p) => p.weight));
  const pos: Record<string, Point & { s: number }> = {};

  if (opts.hasStrength) {
    for (const p of members) {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const s = p.weight / maxW;
      const want = Math.min(d, 46 + p.r + (1 - s) * 150);
      pos[p.id] = { x: c.x + (dx / d) * want, y: c.y + (dy / d) * want, s };
    }
  } else {
    const sorted = [...members].sort((u, v) => Math.atan2(u.y - c.y, u.x - c.x) - Math.atan2(v.y - c.y, v.x - c.x));
    const radius = sorted.length > 5 ? 100 : 78;
    sorted.forEach((p, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sorted.length;
      pos[p.id] = { x: c.x + radius * Math.cos(angle), y: c.y + radius * Math.sin(angle), s: 0.6 };
    });
  }

  for (let pass = 0; pass < 14; pass += 1) {
    for (let i = 0; i < members.length; i += 1) {
      for (let k = i + 1; k < members.length; k += 1) {
        const a = pos[members[i]!.id]!;
        const b = pos[members[k]!.id]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = members[i]!.r + members[k]!.r + 7;
        if (d < min) {
          const f = (min - d) / 2 / d;
          a.x -= dx * f;
          a.y -= dy * f;
          b.x += dx * f;
          b.y += dy * f;
        }
      }
    }
  }

  for (const p of members) {
    const q = pos[p.id]!;
    pos[p.id] = { x: lerp(p.x, q.x, inside), y: lerp(p.y, q.y, inside), s: q.s };
  }
  return { c, inside, pos };
}

export interface LabelItem {
  id: string;
  x: number;
  y: number;
  r: number;
  /** Estimated text width. */
  w: number;
}

/** Greedy label placement around each dot, avoiding other labels and obstacles (reference
 * `placeLabels`). Items with no free spot are left out (their tooltip still works). */
export function placeLabels(
  items: readonly LabelItem[],
  bounds: { x0: number; x1: number; y0: number; y1: number },
  obstacles: readonly { id: string; x: number; y: number; r: number }[],
): Record<string, { a: "start" | "end" | "middle"; x: number; y: number }> {
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const placed: Box[] = [];
  const out: Record<string, { a: "start" | "end" | "middle"; x: number; y: number }> = {};
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  for (const it of items) {
    const spots: Array<["start" | "end" | "middle", number, number]> = [
      ["start", it.x + it.r + 6, it.y + 4],
      ["end", it.x - it.r - 6, it.y + 4],
      ["middle", it.x, it.y - it.r - 6],
      ["middle", it.x, it.y + it.r + 16],
      ["start", it.x + it.r * 0.7 + 4, it.y - it.r - 3],
      ["start", it.x + it.r * 0.7 + 4, it.y + it.r + 15],
      ["end", it.x - it.r * 0.7 - 4, it.y - it.r - 3],
      ["end", it.x - it.r * 0.7 - 4, it.y + it.r + 15],
    ];
    for (const [a, x, y] of spots) {
      const x0 = a === "start" ? x : a === "end" ? x - it.w : x - it.w / 2;
      const box = { x0, x1: x0 + it.w, y0: y - 12, y1: y + 5 };
      if (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1) continue;
      if (placed.some((b) => hit(b, box))) continue;
      if (obstacles.some((o) => o.id !== it.id && o.x + o.r > box.x0 && o.x - o.r < box.x1 && o.y + o.r > box.y0 && o.y - o.r < box.y1)) continue;
      placed.push(box);
      out[it.id] = { a, x, y };
      break;
    }
  }
  return out;
}

export interface MagnetMember extends Point {
  r: number;
}

export interface MagnetLabelPlacement extends Point {
  anchor: "start" | "end" | "middle";
}

const SQRT1_2 = Math.SQRT1_2;

/**
 * The eight directions `magnetLabelOffset` tries, below first (the reference's fixed spot),
 * then above, only turning to the sides and the diagonals once neither clears. `anchor` keeps a
 * side placement growing away from the magnet's own circle rather than back over it.
 */
const MAGNET_LABEL_DIRECTIONS: { dx: number; dy: number; anchor: MagnetLabelPlacement["anchor"] }[] = [
  { dx: 0, dy: 1, anchor: "middle" }, // below
  { dx: 0, dy: -1, anchor: "middle" }, // above
  { dx: 1, dy: 0, anchor: "start" }, // right
  { dx: -1, dy: 0, anchor: "end" }, // left
  { dx: SQRT1_2, dy: SQRT1_2, anchor: "start" }, // lower-right
  { dx: SQRT1_2, dy: -SQRT1_2, anchor: "start" }, // upper-right
  { dx: -SQRT1_2, dy: SQRT1_2, anchor: "end" }, // lower-left
  { dx: -SQRT1_2, dy: -SQRT1_2, anchor: "end" }, // upper-left
];
const MAGNET_LABEL_DISTANCES = [44, 62, 80, 98, 116, 136, 156, 176, 196];

/**
 * Local placement (from the magnet glyph's own centre) for its taste-name label, so a member
 * pulled in close does not sit under it. `members` are member dot positions relative to the
 * magnet (member position minus magnet position), exactly as drawn. Tries increasing distances
 * below the magnet, then above, then to each side and corner, keeping the usual "just below"
 * spot — the reference's fixed `y: 44`, `text-anchor: middle` — whenever nothing is in the way
 * there. When every direction still clips someone, keeps whichever clips the least rather than
 * the fixed spot regardless.
 */
export function magnetLabelOffset(members: readonly MagnetMember[], opts: { halfWidth?: number; halfHeight?: number } = {}): MagnetLabelPlacement {
  const halfWidth = opts.halfWidth ?? 46;
  const halfHeight = opts.halfHeight ?? 10;
  const DEFAULT: MagnetLabelPlacement = { x: 0, y: 44, anchor: "middle" };
  // The label's box for a candidate point and anchor: "middle" is centred on the point, "start"/
  // "end" grow away from the magnet so a side placement's text never doubles back over it.
  const boxFor = (x: number, y: number, anchor: MagnetLabelPlacement["anchor"]) => {
    const width = halfWidth * 2;
    const x0 = anchor === "start" ? x : anchor === "end" ? x - width : x - halfWidth;
    return { x0, x1: x0 + width, y0: y - halfHeight, y1: y + halfHeight };
  };
  // How deep the box overlaps the worst member: 0 or less means clear (box-vs-circle
  // separating-axis test, keeping whichever axis gives the least-bad gap).
  const overlapOf = (box: { x0: number; x1: number; y0: number; y1: number }) =>
    members.reduce((worst, m) => {
      const gapX = Math.max(box.x0 - (m.x + m.r), m.x - m.r - box.x1);
      const gapY = Math.max(box.y0 - (m.y + m.r), m.y - m.r - box.y1);
      return Math.max(worst, -Math.max(gapX, gapY));
    }, 0);
  let best = DEFAULT;
  let bestOverlap = overlapOf(boxFor(DEFAULT.x, DEFAULT.y, DEFAULT.anchor));
  for (const { dx, dy, anchor } of MAGNET_LABEL_DIRECTIONS) {
    for (const dist of MAGNET_LABEL_DISTANCES) {
      const x = dx * dist;
      const y = dy * dist;
      const overlap = overlapOf(boxFor(x, y, anchor));
      if (overlap <= 0) return { x, y, anchor };
      // Even when every spot tried still clips someone, keep the one that clips least — never
      // worse than the fixed "just below" spot the reference always used.
      if (overlap < bestOverlap) {
        best = { x, y, anchor };
        bestOverlap = overlap;
      }
    }
  }
  return best;
}

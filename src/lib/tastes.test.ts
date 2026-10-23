import type { Partner } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  computePull,
  magnetLabelOffset,
  membersOf,
  placeLabels,
  runHasStrength,
  selectTastes,
  tasteAnnouncement,
  tasteCell,
  tasteLine,
  type MagnetMember,
  type PullMember,
} from "./tastes";

function partner(id: string, score: number, sharedTags: string[], aff?: Record<string, number>): Partner {
  return {
    id,
    name: `Partner ${id}`,
    kind: "music",
    matchScore: score,
    sharedTags,
    crowdTags: aff ? Object.entries(aff).map(([label, them]) => ({ label, you: 0.5, them, onPartner: true })) : undefined,
  } as unknown as Partner;
}

const vis = [
  partner("a", 90, ["Vinyl", "Slow mornings"], { Vinyl: 0.9, "Slow mornings": 0.3 }),
  partner("b", 80, ["Vinyl", "Wellbeing"], { Vinyl: 0.5, Wellbeing: 0.5 }),
  partner("c", 70, ["Slow mornings", "Wellbeing", "Vinyl"], { "Slow mornings": 0.4, Wellbeing: 0.4, Vinyl: 0.2 }),
  partner("d", 60, ["Books"], { Books: 0.8 }),
  partner("e", 55, ["Slow mornings"], { "Slow mornings": 0.6 }),
];

describe("selectTastes", () => {
  it("keeps tastes with at least 2 members, strongest flow first, at most 6", () => {
    const tastes = selectTastes(vis, true);
    expect(tastes.map((t) => t.name)).toEqual(["Vinyl", "Slow mornings", "Wellbeing"]);
    expect(tastes.some((t) => t.name === "Books")).toBe(false);
    const many = Array.from({ length: 10 }, (_, i) => partner(`p${i}`, 80, ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"]));
    expect(selectTastes(many, false)).toHaveLength(6);
  });

  it("weights are each taste's share of the partner's shared-taste affinity on live runs", () => {
    const vinyl = selectTastes(vis, true)[0]!;
    expect(vinyl.hasStrength).toBe(true);
    expect(vinyl.weights.a).toBeCloseTo(0.75);
    expect(vinyl.weights.b).toBeCloseTo(0.5);
    expect(tasteLine(vinyl, vis[0]!)).toBe("Vinyl: 75% of their match");
    expect(tasteCell(vinyl, vis[3]!)).toBe("No");
  });

  it("is membership only (no percentages) for snapshot and mock", () => {
    const tastes = selectTastes(vis, false);
    expect(tastes.every((t) => !t.hasStrength)).toBe(true);
    expect(Object.values(tastes[0]!.weights).every((w) => w === 1)).toBe(true);
    const line = tasteLine(tastes[0]!, vis[0]!)!;
    expect(line).toBe("Vinyl: they share it");
    expect(line).not.toMatch(/%/);
    expect(tasteCell(tastes[0]!, vis[0]!)).toBe("Shares it");
  });

  it("no partner-side affinities means no strength even on live runs", () => {
    const bare = vis.map((p) => ({ ...p, crowdTags: undefined }));
    expect(selectTastes(bare, true).every((t) => !t.hasStrength)).toBe(true);
    // Your crowd's affinity alone is the same for every partner: never a strength.
    const youOnly = vis.map((p) => ({ ...p, crowdTags: p.sharedTags.map((label) => ({ label, you: 0.9, onPartner: true })) }));
    const tastes = selectTastes(youOnly, true);
    expect(tastes.every((t) => !t.hasStrength)).toBe(true);
    expect(tasteLine(tastes[0]!, youOnly[1]!)).toBe("Vinyl: they share it");
  });

  it("recomputes for the filtered set and drops tastes whose members vanish", () => {
    const filtered = vis.filter((p) => p.id !== "b" && p.id !== "c");
    const tastes = selectTastes(filtered, true);
    expect(tastes.map((t) => t.name)).toEqual(["Slow mornings"]);
    const vinyl = selectTastes(vis, true)[0]!;
    expect(membersOf(vinyl, filtered).map((p) => p.id)).toEqual(["a"]);
  });

  it("announces with and without strengths", () => {
    expect(tasteAnnouncement(selectTastes(vis, true)[0]!, vis)).toBe("Vinyl. 3 partners share it, strongest is Partner a.");
    expect(tasteAnnouncement(selectTastes(vis, false)[0]!, vis)).toBe("Vinyl. 3 partners share it.");
    expect(tasteAnnouncement(null, vis)).toBe("Taste focus cleared.");
  });

  it("only live Qloo runs carry strengths", () => {
    expect(runHasStrength({ provider: "qloo", providerLabel: "Qloo" })).toBe(true);
    expect(runHasStrength({ provider: "qloo", providerLabel: "Saved Qloo results · 2026-10-15" })).toBe(false);
    expect(runHasStrength({ provider: "mock", providerLabel: "Demo data" })).toBe(false);
  });
});

describe("computePull", () => {
  const viewBox = { x0: 0, y0: 0, x1: 780, y1: 470 };
  const members: PullMember[] = [
    { id: "strong", x: 300, y: 100, r: 12, weight: 0.9 },
    { id: "mid", x: 200, y: 300, r: 12, weight: 0.5 },
    { id: "weak", x: 100, y: 150, r: 12, weight: 0.1 },
  ];
  const magnet = { x: 600, y: 350 };
  const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

  it("puts stronger links closer to the magnet", () => {
    const { pos, c } = computePull({ members, magnet, viewBox, hasStrength: true });
    expect(dist(pos.strong!, c)).toBeLessThan(dist(pos.mid!, c));
    expect(dist(pos.mid!, c)).toBeLessThan(dist(pos.weak!, c));
  });

  it("never moves anyone further from the magnet than their honest position", () => {
    const near: PullMember[] = [...members, { id: "close", x: 590, y: 340, r: 10, weight: 0.1 }];
    const { pos, c } = computePull({ members: near, magnet, viewBox, hasStrength: true });
    for (const p of near) expect(dist(pos[p.id]!, c)).toBeLessThanOrEqual(dist(p, c) + 1e-6 + 30);
    // Without overlap pressure the rule is exact.
    const solo = computePull({ members: [near[3]!], magnet, viewBox, hasStrength: true });
    expect(dist(solo.pos.close!, solo.c)).toBeLessThanOrEqual(dist(near[3]!, solo.c) + 1e-9);
  });

  it("only moves the members it is given (non-members are not touched)", () => {
    const { pos } = computePull({ members, magnet, viewBox, hasStrength: true });
    expect(Object.keys(pos).sort()).toEqual(["mid", "strong", "weak"]);
  });

  it("fades the pull to nothing far outside the chart", () => {
    const far = computePull({ members, magnet: { x: 2000, y: 2000 }, viewBox, hasStrength: true });
    expect(far.inside).toBe(0);
    for (const p of members) expect(far.pos[p.id]).toMatchObject({ x: p.x, y: p.y });
    const edge = computePull({ members, magnet: { x: 790, y: 235 }, viewBox, hasStrength: true });
    expect(edge.inside).toBeGreaterThan(0);
    expect(edge.inside).toBeLessThan(1);
  });

  it("leaves no overlaps after resolving", () => {
    const crowd: PullMember[] = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, x: 100 + i * 5, y: 100, r: 14, weight: 0.9 }));
    const { pos } = computePull({ members: crowd, magnet, viewBox, hasStrength: true });
    for (let i = 0; i < crowd.length; i += 1)
      for (let k = i + 1; k < crowd.length; k += 1) expect(dist(pos[`m${i}`]!, pos[`m${k}`]!)).toBeGreaterThanOrEqual(14 + 14 + 7 - 0.5);
  });

  it("without strengths spaces members evenly on a ring and ignores weights", () => {
    const a = computePull({ members, magnet, viewBox, hasStrength: false });
    const b = computePull({ members: members.map((p, i) => ({ ...p, weight: [0.1, 0.9, 0.5][i]! })), magnet, viewBox, hasStrength: false });
    expect(a.pos).toEqual(b.pos);
    const radii = members.map((p) => dist(a.pos[p.id]!, a.c));
    for (const r of radii) expect(r).toBeCloseTo(78, 0);
    const angles = members.map((p) => Math.atan2(a.pos[p.id]!.y - a.c.y, a.pos[p.id]!.x - a.c.x)).sort((x, y) => x - y);
    const gaps = angles.map((v, i) => (i ? v - angles[i - 1]! : v + 2 * Math.PI - angles[angles.length - 1]!));
    for (const g of gaps) expect(g).toBeCloseTo((2 * Math.PI) / 3, 1);
  });
});

describe("placeLabels", () => {
  it("places labels without overlapping and skips items with no room", () => {
    const items = [
      { id: "a", x: 100, y: 100, r: 10, w: 60 },
      { id: "b", x: 100, y: 112, r: 10, w: 60 },
    ];
    const out = placeLabels(items, { x0: 0, x1: 400, y0: 0, y1: 400 }, []);
    expect(Object.keys(out)).toEqual(["a", "b"]);
    const none = placeLabels([{ id: "x", x: 5, y: 5, r: 10, w: 300 }], { x0: 0, x1: 40, y0: 0, y1: 40 }, []);
    expect(none).toEqual({});
  });
});

/** Independently re-checks what `magnetLabelOffset` itself checks: a placement's box (by its
 * anchor) against every member, true only when none overlaps — used so these tests verify the
 * real postcondition rather than a hand-derived coordinate that is easy to get wrong by hand. */
function isClearOf(
  placement: { x: number; y: number; anchor: "start" | "end" | "middle" },
  members: readonly MagnetMember[],
  halfWidth = 46,
  halfHeight = 10,
) {
  const width = halfWidth * 2;
  const x0 = placement.anchor === "start" ? placement.x : placement.anchor === "end" ? placement.x - width : placement.x - halfWidth;
  const box = { x0, x1: x0 + width, y0: placement.y - halfHeight, y1: placement.y + halfHeight };
  return members.every((m) => {
    const gapX = Math.max(box.x0 - (m.x + m.r), m.x - m.r - box.x1);
    const gapY = Math.max(box.y0 - (m.y + m.r), m.y - m.r - box.y1);
    return gapX >= 0 || gapY >= 0;
  });
}

describe("magnetLabelOffset", () => {
  it("keeps the usual spot just below the magnet when nothing is in the way", () => {
    expect(magnetLabelOffset([])).toEqual({ x: 0, y: 44, anchor: "middle" });
    const far: MagnetMember[] = [{ x: 0, y: 200, r: 12 }];
    expect(magnetLabelOffset(far)).toEqual({ x: 0, y: 44, anchor: "middle" });
  });

  it("moves further below when a member sits right under the default spot, and actually clears it", () => {
    // A member pulled in close, almost straight under the magnet, at the default label's depth.
    const blocking: MagnetMember[] = [{ x: 2, y: 44, r: 14 }];
    const offset = magnetLabelOffset(blocking);
    expect(offset.anchor).toBe("middle");
    expect(offset.y).toBeGreaterThan(44);
    expect(isClearOf(offset, blocking)).toBe(true);
  });

  it("tries above the magnet once every spot below is blocked, and the result is clear", () => {
    const belowDists = [44, 62, 80, 98, 116, 136, 156, 176, 196];
    const wall: MagnetMember[] = belowDists.map((y) => ({ x: 0, y, r: 20 }));
    const offset = magnetLabelOffset(wall);
    expect(offset.y).toBeLessThan(0);
    expect(isClearOf(offset, wall)).toBe(true);
  });

  it("can find a clear spot off the vertical axis when nothing there works", () => {
    // Members directly above and below at every tried distance: only a side or diagonal spot
    // (a non-"middle" anchor) can be clear here.
    const dists = [44, 62, 80, 98, 116, 136, 156, 176, 196];
    const wall: MagnetMember[] = [...dists, ...dists.map((d) => -d)].map((y) => ({ x: 0, y, r: 20 }));
    const offset = magnetLabelOffset(wall);
    expect(offset.anchor).not.toBe("middle");
    expect(isClearOf(offset, wall)).toBe(true);
  });

  it("never does worse than the default spot when genuinely surrounded on every side", () => {
    // One member big enough to block every candidate box in every direction and distance tried.
    const engulfing: MagnetMember[] = [{ x: 0, y: 0, r: 500 }];
    const defaultOverlap = () => {
      const box = { x0: -46, x1: 46, y0: 34, y1: 54 };
      const m = engulfing[0]!;
      const gapX = Math.max(box.x0 - (m.x + m.r), m.x - m.r - box.x1);
      const gapY = Math.max(box.y0 - (m.y + m.r), m.y - m.r - box.y1);
      return -Math.max(gapX, gapY);
    };
    const offset = magnetLabelOffset(engulfing);
    const m = engulfing[0]!;
    const width = 92;
    const x0 = offset.anchor === "start" ? offset.x : offset.anchor === "end" ? offset.x - width : offset.x - 46;
    const box = { x0, x1: x0 + width, y0: offset.y - 10, y1: offset.y + 10 };
    const gapX = Math.max(box.x0 - (m.x + m.r), m.x - m.r - box.x1);
    const gapY = Math.max(box.y0 - (m.y + m.r), m.y - m.r - box.y1);
    const resultOverlap = -Math.max(gapX, gapY);
    expect(resultOverlap).toBeLessThanOrEqual(defaultOverlap());
  });

  it("gives a long taste name more berth than a short one", () => {
    // Off to the side, just outside a short name's box but well inside a long one's.
    const nearby: MagnetMember[] = [{ x: 70, y: 44, r: 10 }];
    const narrow = magnetLabelOffset(nearby, { halfWidth: 46 });
    const wide = magnetLabelOffset(nearby, { halfWidth: 120 });
    expect(narrow).toEqual({ x: 0, y: 44, anchor: "middle" }); // short name: never in its way
    expect(isClearOf(wide, nearby, 120)).toBe(true);
    expect(wide).not.toEqual({ x: 0, y: 44, anchor: "middle" }); // long name: had to move
  });

  it("a member far off to the side never pushes the label away", () => {
    const sideOnly: MagnetMember[] = [{ x: 200, y: 44, r: 14 }];
    expect(magnetLabelOffset(sideOnly)).toEqual({ x: 0, y: 44, anchor: "middle" });
  });

  it("a dense, realistic cluster of members around the magnet always ends up clear", () => {
    // Several tastes' worth of members at the close distances strength-mode pulls to (46 to
    // ~196px), scattered at different angles — the case the browser-level check exercises.
    for (let seed = 0; seed < 12; seed += 1) {
      const count = 3 + (seed % 6);
      const members: MagnetMember[] = Array.from({ length: count }, (_, i) => {
        const angle = ((seed * 37 + i * 53) % 360) * (Math.PI / 180);
        const dist = 46 + ((seed * 19 + i * 29) % 150);
        return { x: dist * Math.cos(angle), y: dist * Math.sin(angle), r: 10 + (i % 8) };
      });
      const offset = magnetLabelOffset(members);
      expect(isClearOf(offset, members)).toBe(true);
    }
  });
});

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Partner, PartnerKind } from "@shared/types";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { bindPartnerPointer, type TipLine } from "@/components/results/overview/OverviewTip";
import { partnerOpacity, tasteTipLine, useTasteFocus, type TasteFocus } from "@/components/results/overview/tasteFocus";
import {
  hasQlooPopularity,
  kindLabel,
  PARTNER_BLUE,
  pct,
  prefersStaticMotion,
  score01,
} from "@/lib/overviewModel";
import { computePull, magnetLabelOffset, membersOf, placeLabels, rankedMembers, tasteCell, type Point, type Taste } from "@/lib/tastes";
import { cn } from "@/lib/cn";

const NARROW =
  typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false;

// Radial chart: distance from the centre = overlap score; angle only groups partners by kind.
const V = NARROW ? { W: 380, H: 400 } : { W: 780, H: 470 };
const C = { x: V.W / 2, y: V.H / 2 };
const R = NARROW ? 150 : 192; // outer ring
const R_IN = NARROW ? 34 : 46; // the "You" disk
const GAP = 0.2; // radians between kind groups
const LABEL_GAP = 15;
const PLUM = "#6B3FA0";

// Where the magnet rests during the demo pull. The reference's offsets (+225,+215 / +140,+150)
// were sized for its 760×700 orbit; here they are scaled so the widest ring of members (100px
// plus dot radius) stays inside this shorter viewBox.
const DOCK: Point = NARROW ? { x: C.x + 60, y: C.y + 75 } : { x: C.x + 225, y: C.y + 85 };
const DEMO_FROM: Point = { x: DOCK.x + 170, y: DOCK.y + 150 };
const DEMO_SLIDE_MS = 750;
const DEMO_HOLD_MS = 1500;
const RELEASE_MS = 1150;
const DRAG_PX = 6;

const DEFAULT_NOTE_TAIL = "It illustrates the score, not a count of people.";

/** The horseshoe from the reference (`MAGNET_ICON`). */
function MagnetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3.5h4.5v8.5a2.5 2.5 0 0 0 5 0V3.5H19V12a7 7 0 0 1-14 0z" fill="currentColor" />
      <path d="M5 3.5h4.5v3.2H5zM14.5 3.5H19v3.2h-4.5z" fill="currentColor" opacity=".45" />
    </svg>
  );
}

function tipLines(p: Partner, focus: TasteFocus): TipLine[] {
  const dist = p.venueFacts?.distanceM;
  const lines: TipLine[] = [
    { className: "v", text: `${Math.round(p.matchScore)} overlap` },
    { className: "l", text: `${p.name} · ${kindLabel(p.kind)}` },
    {
      className: "l",
      text:
        typeof dist === "number"
          ? `${(dist / 1000).toFixed(1)} km away`
          : p.local
            ? "Local place"
            : "No fixed location",
    },
  ];
  const taste = tasteTipLine(focus, p);
  return taste ? [...lines, taste] : lines;
}

function short(name: string, max: number) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

type PullMode = "idle" | "pulling" | "release";

export function OrbitPanel({
  youName,
  partners,
  selectedId,
  hoverId,
  setHover,
  select,
}: {
  youName: string;
  partners: Partner[];
  selectedId: string | null;
  hoverId: string | null;
  setHover: (id: string | null) => void;
  select: (id: string | null) => void;
}) {
  const focus = useTasteFocus();
  const still = prefersStaticMotion();

  // Score domain follows the data so the spread uses the whole disk.
  const lo = useMemo(() => {
    const min = partners.length ? Math.min(...partners.map(score01)) : 0.5;
    return Math.max(0, Math.min(0.6, Math.floor((min - 0.04) * 10) / 10));
  }, [partners]);

  const radiusFor = (score: number) => R_IN + 18 + (1 - (score - lo) / (1 - lo)) * (R - R_IN - 18);

  const model = useMemo(() => {
    const items = partners.slice(0, 12);
    // Group by kind (strongest kind first), then spread each group over its own arc.
    const groups = new Map<PartnerKind, Partner[]>();
    for (const p of items) groups.set(p.kind, [...(groups.get(p.kind) ?? []), p]);
    const ordered = [...groups.entries()].sort(
      (a, b) => b[1].reduce((s, p) => s + p.matchScore, 0) / b[1].length - a[1].reduce((s, p) => s + p.matchScore, 0) / a[1].length,
    );
    const slots = items.length;
    const usable = Math.PI * 2 - GAP * ordered.length;
    const step = slots > 0 ? usable / slots : 0;
    let angle = -Math.PI / 2 + GAP / 2 + step / 2;
    const nodes: { p: Partner; x: number; y: number; r: number; angle: number; d: number }[] = [];
    for (const [, list] of ordered) {
      for (const p of list.sort((a, b) => b.matchScore - a.matchScore)) {
        const d = radiusFor(score01(p));
        const pop = hasQlooPopularity(p) ? p.scoreBasis!.popularity : 0.4;
        nodes.push({
          p,
          d,
          r: (NARROW ? 7 : 10) + pop * (NARROW ? 4 : 7),
          angle,
          x: C.x + d * Math.cos(angle),
          y: C.y + d * Math.sin(angle),
        });
        angle += step;
      }
      angle += GAP;
    }

    // Labels sit beside their dot (right half → right, left half → left), then get nudged
    // apart vertically per side so neighbours never print over each other.
    const sides = { left: [] as typeof nodes, right: [] as typeof nodes };
    for (const n of nodes) (Math.cos(n.angle) >= 0 ? sides.right : sides.left).push(n);
    const labelY = new Map<string, number>();
    for (const side of [sides.left, sides.right]) {
      side.sort((a, b) => a.y - b.y);
      let prev = -Infinity;
      for (const n of side) {
        const y = Math.max(n.y, prev + LABEL_GAP);
        labelY.set(n.p.id, y);
        prev = y;
      }
      // pull the stack back up if it ran off the bottom
      const last = side[side.length - 1];
      if (last && (labelY.get(last.p.id) ?? 0) > V.H - 14) {
        const shift = (labelY.get(last.p.id) ?? 0) - (V.H - 14);
        for (const n of side) labelY.set(n.p.id, (labelY.get(n.p.id) ?? 0) - shift);
      }
    }

    // Put the ring values where no dot sits: the widest angular gap.
    const angles = nodes.map((n) => ((n.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
    let bestGap = -1;
    let tickAngle = Math.PI / 2;
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!;
      const b = i + 1 < angles.length ? angles[i + 1]! : angles[0]! + Math.PI * 2;
      if (b - a > bestGap) {
        bestGap = b - a;
        tickAngle = (a + b) / 2;
      }
    }
    return { nodes, labelY, tickAngle };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- radiusFor derives from lo
  }, [partners, lo]);

  const byKind = useMemo(() => {
    const g = new Map<string, number[]>();
    for (const p of partners) {
      const list = g.get(p.kind) ?? [];
      list.push(score01(p));
      g.set(p.kind, list);
    }
    return [...g.entries()]
      .map(([k, scores]) => [k, scores.reduce((a, b) => a + b, 0) / scores.length] as const)
      .sort((a, b) => b[1] - a[1]);
  }, [partners]);

  // ---------------------------------------------------------------- taste magnets (pull)
  const [pull, setPull] = useState<PullMode>("idle");
  const [liftId, setLiftId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const mvRefs = useRef(new Map<string, SVGGElement>());
  const pullLabelRefs = useRef(new Map<string, SVGTextElement>());
  const leadersRef = useRef<SVGGElement>(null);
  const magnetRef = useRef<SVGGElement>(null);
  const magnetLabelRef = useRef<SVGTextElement>(null);
  const live = useRef({ on: false, demo: 0, frame: 0, releaseTimer: 0 });
  const modelRef = useRef(model);
  modelRef.current = model;

  const honest = (id: string) => modelRef.current.nodes.find((n) => n.p.id === id);

  /** One frame of the pull: positions, labels, leader lines and the magnet glyph. No React
   * state is touched here; transforms are written straight to the elements. */
  const applyPull = (taste: Taste, m: Point) => {
    live.current.on = true;
    const nodes = modelRef.current.nodes;
    const members = nodes.filter((n) => (taste.weights[n.p.id] ?? 0) > 0);
    const { c, inside, pos } = computePull({
      members: members.map((n) => ({ id: n.p.id, x: n.x, y: n.y, r: n.r, weight: taste.weights[n.p.id] ?? 0 })),
      magnet: m,
      viewBox: { x0: 0, y0: 0, x1: V.W, y1: V.H },
      hasStrength: taste.hasStrength,
    });
    for (const n of members) {
      const q = pos[n.p.id]!;
      const el = mvRefs.current.get(n.p.id);
      if (el) el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
    }
    // Labels only for members, avoiding the magnet and each other (dimmed partners are not obstacles).
    const obstacles = [{ id: "magnet", x: c.x, y: c.y, r: 28 }, ...members.map((n) => ({ id: n.p.id, x: pos[n.p.id]!.x, y: pos[n.p.id]!.y, r: n.r + 2 }))];
    const items = members.map((n) => ({ id: n.p.id, x: pos[n.p.id]!.x, y: pos[n.p.id]!.y, r: n.r, w: short(n.p.name, 22).length * 6.6 }));
    const placed = placeLabels(items, { x0: 4, x1: V.W - 4, y0: 14, y1: V.H - 4 }, obstacles);
    for (const [id, el] of pullLabelRefs.current) {
      const spot = placed[id];
      el.style.opacity = spot ? "1" : "0";
      if (spot) {
        el.setAttribute("x", spot.x.toFixed(1));
        el.setAttribute("y", spot.y.toFixed(1));
        el.setAttribute("text-anchor", spot.a);
      }
    }
    if (leadersRef.current) {
      leadersRef.current.innerHTML = members
        .map((n) => {
          const q = pos[n.p.id]!;
          return `<line x1="${c.x.toFixed(1)}" y1="${c.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke-width="${(1.4 + 3.2 * q.s).toFixed(1)}" stroke-opacity="${(0.6 * inside).toFixed(2)}"/>`;
        })
        .join("");
    }
    if (magnetRef.current) {
      magnetRef.current.setAttribute("transform", `translate(${m.x.toFixed(1)},${m.y.toFixed(1)})`);
      magnetRef.current.setAttribute("opacity", "1");
    }
    if (magnetLabelRef.current) {
      // Keep the taste name clear of any member pulled in close, by nudging it below (or, if
      // that is crowded too, above) the magnet instead of its usual fixed spot. The box we
      // clear it against is sized to the name itself (bold 13px, plus its white halo), so a
      // long taste ("Design Enthusiasts") gets as much berth as a short one ("Vinyl").
      const local = members.map((n) => ({ x: pos[n.p.id]!.x - m.x, y: pos[n.p.id]!.y - m.y, r: n.r }));
      const halfWidth = Math.max(46, (taste.name.length * 7) / 2 + 6);
      const offset = magnetLabelOffset(local, { halfWidth, halfHeight: 11 });
      magnetLabelRef.current.setAttribute("x", offset.x.toFixed(1));
      magnetLabelRef.current.setAttribute("y", offset.y.toFixed(1));
      magnetLabelRef.current.setAttribute("text-anchor", offset.anchor);
      magnetLabelRef.current.textContent = taste.name;
    }
  };

  /** Let go: everyone springs back to their honest overlap position. */
  const releasePull = () => {
    cancelAnimationFrame(live.current.frame);
    if (!live.current.on) return;
    live.current.on = false;
    for (const [id, el] of mvRefs.current) {
      const n = honest(id);
      if (n) el.style.transform = `translate(${n.x}px, ${n.y}px)`;
    }
    for (const el of pullLabelRefs.current.values()) el.style.opacity = "0";
    if (leadersRef.current) leadersRef.current.innerHTML = "";
    magnetRef.current?.setAttribute("opacity", "0");
    setPull("release");
    window.clearTimeout(live.current.releaseTimer);
    live.current.releaseTimer = window.setTimeout(() => setPull("idle"), RELEASE_MS);
  };

  const demoPull = (taste: Taste) => {
    const mine = ++live.current.demo;
    window.clearTimeout(live.current.releaseTimer);
    setPull("pulling");
    const t0 = performance.now();
    const step = (t: number) => {
      if (live.current.demo !== mine) return;
      const k = Math.min(1, Math.max(0, (t - t0) / DEMO_SLIDE_MS));
      const e = 1 - Math.pow(1 - k, 3);
      applyPull(taste, { x: DEMO_FROM.x + (DOCK.x - DEMO_FROM.x) * e, y: DEMO_FROM.y + (DOCK.y - DEMO_FROM.y) * e });
      if (t - t0 < DEMO_SLIDE_MS + DEMO_HOLD_MS) live.current.frame = requestAnimationFrame(step);
      else releasePull();
    };
    live.current.frame = requestAnimationFrame(step);
  };

  // A press (tray pill or flow node) asks for the demo pull; any new action cancels it.
  useEffect(() => {
    if (!focus.demoAt || still || !focus.taste) return;
    demoPull(focus.taste);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a new press
  }, [focus.demoAt]);

  // Clearing the taste (chip ×, Escape, pressing it again) ends any pull at once.
  useEffect(() => {
    if (!focus.taste) {
      live.current.demo += 1;
      releasePull();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the taste only
  }, [focus.taste?.id]);

  useEffect(
    () => () => {
      cancelAnimationFrame(live.current.frame);
      window.clearTimeout(live.current.releaseTimer);
    },
    [],
  );

  const toSvg = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const ctm = typeof svg?.getScreenCTM === "function" ? svg.getScreenCTM() : null;
    if (!svg || !ctm) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const out = pt.matrixTransform(ctm.inverse());
    return { x: out.x, y: out.y };
  };

  /** Pointer handling for a tray pill (reference `bindMagnet`): move more than 6px to drag the
   * magnet (pins the taste); a press without moving toggles it and plays the demo. */
  const drag = useRef<{ tasteId: string; id: number; x0: number; y0: number; moved: boolean } | null>(null);
  const magnetHandlers = (taste: Taste) => {
    // The drag survives the re-renders it causes (pin, lift), so its state lives in a ref.
    const current = () => (drag.current?.tasteId === taste.id ? drag.current : null);
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        drag.current = { tasteId: taste.id, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // best effort
        }
      },
      onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
        const st = current();
        if (!st || e.pointerId !== st.id) return;
        if (!st.moved && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > DRAG_PX) {
          st.moved = true;
          live.current.demo += 1;
          window.clearTimeout(live.current.releaseTimer);
          focus.pin(taste.id);
          setPull("pulling");
          setLiftId(taste.id);
        }
        if (st.moved) {
          const { clientX, clientY } = e;
          cancelAnimationFrame(live.current.frame);
          live.current.frame = requestAnimationFrame(() => applyPull(taste, toSvg(clientX, clientY)));
        }
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        const st = current();
        if (!st || e.pointerId !== st.id) return;
        drag.current = null;
        setLiftId(null);
        if (st.moved) releasePull();
        else focus.toggle(taste.id);
      },
      onPointerCancel: () => {
        if (current()?.moved) releasePull();
        drag.current = null;
        setLiftId(null);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focus.toggle(taste.id);
        }
      },
    };
  };

  // ---------------------------------------------------------------- copy
  const taste = focus.taste;
  const members = taste ? rankedMembers(taste, partners) : [];
  const pulling = pull === "pulling";

  let title =
    byKind.length > 1
      ? `${kindLabel(byKind[0]![0] as Partner["kind"])} sits closest to your crowd, then ${kindLabel(byKind[1]![0] as Partner["kind"])}`
      : byKind.length === 1
        ? `Every ${kindLabel(byKind[0]![0] as Partner["kind"])} partner here shares a slice of your crowd`
        : "Your crowd and theirs";
  let subtitle = `${partners.length} partner${partners.length === 1 ? "" : "s"} placed by taste overlap. The closer a dot is to the centre, the more of its crowd is also yours.`;
  if (taste && members.length) {
    title = `${taste.name} runs through ${members.length} of your ${partners.length} partners${taste.hasStrength ? `, strongest at ${members[0]!.name}` : ""}`;
    subtitle = "Partners outlined in plum share this taste, the rest are dimmed. Drag the magnet over the orbit to pull the plum ones in.";
  } else if (taste) {
    title = `No partner in this view shares ${taste.name.toLowerCase()}`;
    subtitle = "Clear the taste or change the filters to see more.";
  }

  const anyPop = partners.some(hasQlooPopularity);
  const note =
    pulling && taste
      ? taste.hasStrength
        ? `Positions now show how strongly each partner links to ${taste.name.toLowerCase()}. They are not overlap. Let go and they snap back.`
        : `Partners are only grouped by ${taste.name.toLowerCase()} here, so distances mean nothing while you hold it. Let go and they snap back.`
      : `Distance from the centre shows the overlap score${anyPop ? "; a bigger dot means a busier place" : ""}. Angle only groups partners by kind. ${DEFAULT_NOTE_TAIL}`;

  const ticks = Array.from({ length: Math.max(0, Math.round((1 - lo) * 10)) }, (_, i) => Math.round((lo + i * 0.1) * 10) / 10).filter(
    (t) => t < 1,
  );
  const tickDir = { x: Math.cos(model.tickAngle), y: Math.sin(model.tickAngle) };

  return (
    <ChartCard
      id="c-orbit"
      className={cn("ov-orbit", taste && "is-tastefocus")}
      title={title}
      subtitle={subtitle}
      note={note}
      legend={
        <>
          <div className="ov-key">
            <span>
              <i style={{ background: "var(--ov-coral)" }} />
              You
            </span>
            <span>
              <i style={{ background: PARTNER_BLUE }} />
              {anyPop ? "Partner, bigger means busier" : "Partner"}
            </span>
            {taste ? (
              <span>
                <i className="pl" />
                Shares the taste you picked
              </span>
            ) : null}
          </div>
          {focus.tastes.length ? (
            <div className="ov-tray">
              <p className="ov-trayh">
                Pull a taste <span>Drag one onto the orbit, or press it to light it up in every chart.</span>
              </p>
              <div className="ov-mgs" role="group" aria-label="Shared tastes">
                {focus.tastes.map((t) => {
                  const n = membersOf(t, partners).length;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cn("ov-magnet", taste?.id === t.id && "is-on", liftId === t.id && "is-lift")}
                      aria-pressed={taste?.id === t.id}
                      aria-label={`${t.name}, shared by ${n} partners. Press to light it up in every chart.`}
                      {...magnetHandlers(t)}
                    >
                      <MagnetIcon />
                      <span>{t.name}</span>
                      <small>{n}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      }
      chart={
        <svg
          ref={svgRef}
          viewBox={`0 0 ${V.W} ${V.H}`}
          role="group"
          aria-label="Radial chart: partners placed by taste overlap with you"
          className={cn(pulling && "is-pulling is-tagmode", pull === "release" && "is-release")}
        >
          {/* guide rings: each ring is an overlap score */}
          <circle cx={C.x} cy={C.y} r={R} fill="#FFF3F0" />
          {ticks.map((t) => (
            <circle
              key={t}
              cx={C.x}
              cy={C.y}
              r={radiusFor(t)}
              fill="none"
              stroke="#F0C9C1"
              strokeWidth={1}
              strokeDasharray={t === lo ? undefined : "2 5"}
            />
          ))}
          <circle cx={C.x} cy={C.y} r={R} fill="none" stroke="#FF6B57" strokeWidth={1.5} opacity={0.8} />
          {ticks.map((t) => (
            <text
              key={`tl-${t}`}
              className="ov-ring-l"
              x={C.x + tickDir.x * radiusFor(t)}
              y={C.y + tickDir.y * radiusFor(t) + 4}
              textAnchor="middle"
            >
              {Math.round(t * 100)}
            </text>
          ))}

          {/* leader lines from the magnet to each member: under the dots */}
          <g ref={leadersRef} className="ov-leaders" aria-hidden="true" />

          {model.nodes.map(({ p, x, y, r }, i) => {
            const hl = hoverId === p.id || selectedId === p.id;
            const member = Boolean(taste) && focus.members.has(p.id);
            const opacity = partnerOpacity(p.id, { hoverId, focus, hoverDim: 0.25, tasteDim: 0.16 });
            const labelHidden = Boolean(taste) && !member && hoverId !== p.id;
            const bind = bindPartnerPointer(p.id, {
              setHover,
              select,
              lines: () => tipLines(p, focus),
            });
            const mvStyle: CSSProperties = {
              transform: `translate(${x}px, ${y}px)`,
              transitionDelay: `${i * 45}ms`,
            };
            const right = x >= C.x;
            const ly = model.labelY.get(p.id) ?? y;
            return (
              <g
                key={p.id}
                className={cn("ov-pn", hl && "hl", selectedId === p.id && "sel", member && "tm")}
                style={{ opacity }}
                {...bind}
                aria-label={`${p.name}, ${Math.round(p.matchScore)} overlap, ${kindLabel(p.kind)}`}
              >
                <g
                  className="ov-mv"
                  style={mvStyle}
                  ref={(el) => {
                    if (el) mvRefs.current.set(p.id, el);
                    else mvRefs.current.delete(p.id);
                  }}
                >
                  {/* spoke back to You: visible on hover / selection */}
                  <line
                    className="ov-spoke"
                    x1={0}
                    y1={0}
                    x2={C.x - x}
                    y2={C.y - y}
                    stroke={PARTNER_BLUE}
                    strokeWidth={2}
                    strokeLinecap="round"
                    style={{ opacity: hl ? 0.55 : 0 }}
                  />
                  <circle r={r + 4} fill={PARTNER_BLUE} opacity={0.16} />
                  <circle r={r} fill={PARTNER_BLUE} stroke="#fff" strokeWidth={2.5} />
                  <circle className="ov-ring" r={r + 3.5} fill="none" stroke={PLUM} strokeWidth={3} />
                  <circle className="ov-fr" r={r + 6} fill="none" stroke="#14151A" strokeWidth={2} />
                  <circle r={Math.max(r, 14) + 6} fill="transparent" />
                </g>
                {(!NARROW || hl) && !labelHidden ? (
                  <g className="ov-lb">
                    {/* leader from the dot out to its label column, outside the ring */}
                    <polyline
                      className="ov-leader"
                      points={`${x + (right ? r + 3 : -(r + 3))},${y} ${C.x + (right ? 1 : -1) * (R + 20)},${ly - 4} ${C.x + (right ? 1 : -1) * (R + 26)},${ly - 4}`}
                      fill="none"
                      stroke={hl ? PARTNER_BLUE : "#D5D9E0"}
                      strokeWidth={hl ? 1.6 : 1}
                    />
                    <text
                      className="ov-lblc"
                      x={C.x + (right ? 1 : -1) * (R + 32)}
                      y={ly}
                      textAnchor={right ? "start" : "end"}
                    >
                      {short(p.name, NARROW ? 14 : 22)}
                      <tspan className="ov-lblm" dx={5}>
                        {Math.round(p.matchScore)}
                      </tspan>
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {/* labels used only while a magnet is held (placed beside the pulled dots) */}
          <g className="ov-pull-labels" aria-hidden="true">
            {taste
              ? model.nodes
                  .filter((n) => focus.members.has(n.p.id))
                  .map((n) => (
                    <text
                      key={n.p.id}
                      className="ov-lblc"
                      style={{ opacity: 0 }}
                      ref={(el) => {
                        if (el) pullLabelRefs.current.set(n.p.id, el);
                        else pullLabelRefs.current.delete(n.p.id);
                      }}
                    >
                      {short(n.p.name, 22)}
                    </text>
                  ))
              : null}
          </g>

          {/* You */}
          <circle cx={C.x} cy={C.y} r={R_IN + 7} fill="#FF6B57" opacity={0.18} />
          <circle cx={C.x} cy={C.y} r={R_IN} fill="#FF6B57" stroke="#fff" strokeWidth={3} pointerEvents="none" />
          <text x={C.x} y={C.y - 1} textAnchor="middle" className="ov-you-n" pointerEvents="none">
            {short(youName, NARROW ? 8 : 11)}
          </text>
          <text x={C.x} y={C.y + 13} textAnchor="middle" className="ov-you-s" pointerEvents="none">
            your crowd
          </text>

          {/* the magnet glyph: follows the pointer while held */}
          <g ref={magnetRef} className="ov-magnet-glyph" opacity={0} aria-hidden="true">
            {[46, 86, 126].map((r) => (
              <circle key={r} r={r} fill="none" stroke={PLUM} strokeOpacity={0.2} strokeWidth={1.5} strokeDasharray="3 5" />
            ))}
            <circle r={24} fill={PLUM} stroke="#fff" strokeWidth={3} />
            <path d="M-9 -10v10a9 9 0 0 0 18 0v-10h-5.5v10a3.5 3.5 0 0 1-7 0v-10z" fill="#fff" />
            <text
              ref={magnetLabelRef}
              x={0}
              y={44}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill="#14151A"
              paintOrder="stroke"
              stroke="#fff"
              strokeWidth={4}
              strokeLinejoin="round"
            />
          </g>
        </svg>
      }
      table={
        <DataTable
          head={["Partner", "Kind", "Overlap", "Busy (Qloo)", ...(taste ? [`In ${taste.name.toLowerCase()}`] : [])]}
          rowIds={partners.map((p) => p.id)}
          selectedId={selectedId}
          hoverId={hoverId}
          onRowFocus={setHover}
          onRowSelect={select}
          rows={partners.map((p) => [
            p.name,
            kindLabel(p.kind),
            String(Math.round(p.matchScore)),
            hasQlooPopularity(p) ? String(pct(p.scoreBasis!.popularity)) : "—",
            ...(taste ? [tasteCell(taste, p)] : []),
          ])}
        />
      }
    />
  );
}

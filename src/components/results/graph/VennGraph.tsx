import type { Partner } from "@shared/types";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { Legend } from "@/components/results/graph/Legend";
import { SurpriseSlider } from "@/components/ui/SurpriseSlider";
import { cn } from "@/lib/cn";
import { businessLabel } from "@/lib/format";
import { KIND_META, kindTint } from "@/lib/kinds";
import { useVenn } from "@/store/useVenn";

const HEAT_PALETTE = ["#ffe3dd", "#e3e5ff", "#efe6f7", "#d8f3ec"] as const;
const MAX_GRAPH_PARTNERS = 12;

function rankOf(partner: Partner, surprise: number): number {
  return (1 - surprise) * partner.matchScore + surprise * (0.5 * partner.matchScore + 50 * partner.surprise);
}

function partnerColor(kind: Partner["kind"]): string {
  return KIND_META[kind]?.color ?? "#4f5bff";
}

function shortName(name: string, max = 14) {
  const trimmed = name.split(/[,(/]/)[0]?.trim() ?? name;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function heatCell(partner: Partner, anchor: string, col: number): number {
  const needle = anchor.toLowerCase();
  const tags = [...partner.sharedTags, ...partner.tags].map((tag) => tag.toLowerCase().replace(/_/g, " "));
  const direct = tags.some((tag) => tag.includes(needle) || needle.includes(tag));
  const affinity = partner.signals?.affinityToPartner ?? partner.matchScore / 100;
  const wobble = 0.85 + ((col + partner.matchScore) % 5) * 0.03;
  const base = direct ? Math.max(affinity, partner.matchScore / 100) : (partner.matchScore / 100) * 0.55 * wobble;
  return Math.max(0.18, Math.min(1, base));
}

/** Results Graph: Signal · Heat · Scores — radial signal map fits every partner around You. */
export function VennGraph() {
  const result = useVenn((state) => state.result);
  const surprise = useVenn((state) => state.surprise);
  const setSurprise = useVenn((state) => state.setSurprise);
  const kindFilter = useVenn((state) => state.kindFilter);
  const toggleKind = useVenn((state) => state.toggleKind);
  const selectedId = useVenn((state) => state.selectedId);
  const selectPartner = useVenn((state) => state.select);
  const setHover = useVenn((state) => state.setHover);
  const pinnedIds = useVenn((state) => state.pinnedIds);
  const reduced = useReducedMotion();

  const visible = useMemo(() => {
    if (!result) return [];
    const filtered = result.partners.filter((partner) => kindFilter.has(partner.kind));
    const ranked = [...filtered].sort((a, b) => rankOf(b, surprise) - rankOf(a, surprise));
    const keep = new Set(ranked.slice(0, MAX_GRAPH_PARTNERS).map((partner) => partner.id));
    for (const id of pinnedIds) {
      if (filtered.some((partner) => partner.id === id)) keep.add(id);
    }
    if (selectedId && filtered.some((partner) => partner.id === selectedId)) keep.add(selectedId);
    // Cap at 12 so the radial map stays readable.
    return filtered
      .filter((partner) => keep.has(partner.id))
      .sort((a, b) => rankOf(b, surprise) - rankOf(a, surprise))
      .slice(0, MAX_GRAPH_PARTNERS);
  }, [result, kindFilter, surprise, pinnedIds, selectedId]);

  if (!result) return null;

  const anchors = result.input.anchors.slice(0, 4);
  const youLabel = businessLabel(result.input);
  const activeId = selectedId && visible.some((p) => p.id === selectedId) ? selectedId : (visible[0]?.id ?? "");

  const onSelect = (id: string) => {
    selectPartner(id);
    setHover(id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3 pt-2 md:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Legend partners={result.partners} active={kindFilter} onToggle={toggleKind} />
        <div className="ml-auto w-full max-w-[14rem] rounded-[12px] border border-line bg-paper px-3 py-2 sm:w-56">
          <SurpriseSlider value={surprise} onChange={setSurprise} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-[16px] border border-ink bg-paper">
        {visible.length === 0 ? (
          <p className="grid h-full min-h-[200px] place-items-center text-sm text-ink-soft">
            Turn a type back on to see partners.
          </p>
        ) : (
          <div className="flex h-full min-h-[300px] flex-col divide-y divide-ink lg:min-h-0 lg:flex-row lg:divide-x lg:divide-y-0">
            <section aria-label="Signal map" className="flex min-h-0 min-w-0 flex-[1.35] flex-col">
              <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Signal</p>
                <p className="text-[11px] tabular-nums text-ink-soft">
                  {visible.length} partner{visible.length === 1 ? "" : "s"}
                </p>
              </header>
              <div className="min-h-0 flex-1">
                <SignalMap
                  partners={visible}
                  selectedId={activeId}
                  youLabel={youLabel}
                  reduced={Boolean(reduced)}
                  onSelect={onSelect}
                  onHover={setHover}
                />
              </div>
            </section>

            <section aria-label="Taste heat" className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Heat</p>
                <p className="truncate text-[11px] text-ink-soft">Anchors × partners</p>
              </header>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <HeatPanel
                  partners={visible}
                  anchors={anchors}
                  selectedId={activeId}
                  reduced={Boolean(reduced)}
                  onSelect={onSelect}
                />
              </div>
            </section>

            <section aria-label="Match scores" className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Scores</p>
                <p className="truncate text-[11px] text-ink-soft">Click to open</p>
              </header>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <ScoresPanel
                  partners={visible}
                  selectedId={activeId}
                  reduced={Boolean(reduced)}
                  onSelect={onSelect}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SignalMap({
  partners,
  selectedId,
  youLabel,
  reduced,
  onSelect,
  onHover,
}: {
  partners: Partner[];
  selectedId: string;
  youLabel: string;
  reduced: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const ranked = partners;
  const n = ranked.length;
  const size = 320;
  const hub = { x: size / 2, y: size / 2 };
  const hubR = 22;
  // Keep labels inside the viewBox: ring radius shrinks slightly when crowded.
  const ringR = n <= 6 ? 88 : n <= 9 ? 82 : 76;
  const nameMax = n <= 6 ? 16 : n <= 9 ? 13 : 11;

  const nodes = useMemo(() => {
    return ranked.map((partner, index) => {
      // Start at top (−90°) and go clockwise so the strongest sits at 12 o'clock.
      const angle = -Math.PI / 2 + (index / Math.max(n, 1)) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = hub.x + cos * ringR;
      const y = hub.y + sin * ringR;
      // Label offset outside the ring, clamped so it never clips the SVG edge.
      const labelDist = ringR + 28;
      let lx = hub.x + cos * labelDist;
      let ly = hub.y + sin * labelDist;
      lx = Math.max(36, Math.min(size - 36, lx));
      ly = Math.max(14, Math.min(size - 14, ly));
      const anchor: "start" | "middle" | "end" = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
      return {
        ...partner,
        angle,
        x,
        y,
        lx,
        ly,
        anchor,
        color: partnerColor(partner.kind),
      };
    });
  }, [ranked, n, ringR]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" role="img" aria-label="Radial match signal map">
      <defs>
        <pattern id="results-signal-grid" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.75" fill="#e8eaef" />
        </pattern>
        {nodes.map((node) => (
          <linearGradient key={`rcable-${node.id}`} id={`rcable-${node.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff6b57" />
            <stop offset="100%" stopColor={node.color} />
          </linearGradient>
        ))}
      </defs>

      <rect width={size} height={size} fill="#ffffff" />
      <rect width={size} height={size} fill="url(#results-signal-grid)" />

      {/* Guide ring */}
      <circle cx={hub.x} cy={hub.y} r={ringR} fill="none" stroke="#eceef2" strokeWidth="1" strokeDasharray="3 4" />

      {nodes.map((node, index) => {
        const hot = node.id === selectedId || node.id === hovered;
        const thickness = 1 + (node.matchScore / 100) * 3.2;
        return (
          <motion.path
            key={`path-${node.id}`}
            d={`M ${hub.x} ${hub.y} L ${node.x} ${node.y}`}
            fill="none"
            stroke={`url(#rcable-${node.id})`}
            strokeWidth={hot ? thickness + 1.2 : thickness}
            strokeLinecap="round"
            opacity={hot ? 1 : 0.35}
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: index * 0.03 }}
          />
        );
      })}

      <g>
        <circle cx={hub.x} cy={hub.y} r={hubR} fill="#ff6b57" />
        <circle cx={hub.x} cy={hub.y} r={hubR} fill="none" stroke="#14151a" strokeWidth="1.5" />
        <text x={hub.x} y={hub.y - 2} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800">
          You
        </text>
        <text x={hub.x} y={hub.y + 10} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="7" fontWeight="600">
          {shortName(youLabel, 12)}
        </text>
      </g>

      {nodes.map((node, index) => {
        const hot = node.id === selectedId || node.id === hovered;
        const label = shortName(node.name, nameMax);
        const pillW = Math.max(44, label.length * 5.2 + 10);
        const pillX =
          node.anchor === "start" ? node.lx - 4 : node.anchor === "end" ? node.lx - pillW + 4 : node.lx - pillW / 2;
        return (
          <motion.g
            key={node.id}
            className="cursor-pointer"
            onClick={() => onSelect(node.id)}
            onPointerEnter={() => {
              setHovered(node.id);
              onHover(node.id);
            }}
            onPointerLeave={() => {
              setHovered(null);
              onHover(null);
            }}
            initial={reduced ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 + index * 0.025 }}
            style={{ transformOrigin: `${node.x}px ${node.y}px` }}
          >
            {/* Kind-coloured glow behind the node */}
            <circle cx={node.x} cy={node.y} r={hot ? 14 : 10} fill={node.color} opacity={hot ? 0.28 : 0.14} />
            <circle
              cx={node.x}
              cy={node.y}
              r={hot ? 7 : 5.5}
              fill={node.color}
              stroke={hot ? "#14151a" : "#fff"}
              strokeWidth={hot ? 2 : 1.5}
            />
            <rect
              x={pillX}
              y={node.ly - 12}
              width={pillW}
              height="22"
              rx="7"
              fill={hot ? node.color : "#ffffff"}
              fillOpacity={hot ? 0.92 : 0.94}
              stroke={node.color}
              strokeWidth={hot ? 1.5 : 1}
              strokeOpacity={hot ? 1 : 0.45}
            />
            <text
              x={node.lx}
              y={node.ly - 3}
              textAnchor={node.anchor}
              fill={hot ? "#fff" : "#14151a"}
              fontSize="8"
              fontWeight="700"
            >
              {label}
            </text>
            <text
              x={node.lx}
              y={node.ly + 7}
              textAnchor={node.anchor}
              fill={hot ? "rgba(255,255,255,0.85)" : "#5b6170"}
              fontSize="7"
              fontWeight="700"
            >
              {node.matchScore}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

function ScoresPanel({
  partners,
  selectedId,
  reduced,
  onSelect,
}: {
  partners: Partner[];
  selectedId: string;
  reduced: boolean;
  onSelect: (id: string) => void;
}) {
  const ranked = partners;
  const selected = ranked.find((item) => item.id === selectedId) ?? ranked[0];
  const color = selected ? partnerColor(selected.kind) : "#4f5bff";
  const maxScore = ranked[0]?.matchScore ?? 100;

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="flex items-end justify-between gap-2 px-1">
        <div className="min-w-0 flex-1">
          <motion.p
            key={selected?.id}
            className="text-3xl font-extrabold leading-none tabular-nums text-ink"
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {selected?.matchScore ?? "—"}
          </motion.p>
          <p className="mt-0.5 truncate text-xs font-bold text-ink" title={selected?.name}>
            {selected?.name}
          </p>
        </div>
        <div
          className="relative h-11 w-11 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${color} ${(selected?.matchScore ?? 0) * 3.6}deg, #eef0f4 0)`,
          }}
          aria-hidden="true"
        >
          <div className="absolute inset-[4px] rounded-full bg-paper" />
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto">
        {ranked.map((partner, index) => {
          const active = partner.id === selectedId;
          const barColor = partnerColor(partner.kind);
          const pct = Math.round((partner.matchScore / maxScore) * 100);
          return (
            <li key={partner.id}>
              <button
                type="button"
                onClick={() => onSelect(partner.id)}
                title={partner.name}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left transition",
                  active ? "border-transparent text-ink" : "border-transparent hover:border-line",
                )}
                style={
                  active
                    ? { background: kindTint(partner.kind, 0.32), boxShadow: `inset 3px 0 0 ${barColor}` }
                    : { boxShadow: `inset 3px 0 0 ${barColor}66` }
                }
              >
                <span className="w-3 shrink-0 text-[10px] font-bold tabular-nums text-ink-soft">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1">
                    <span className="min-w-0 truncate text-[11px] font-bold text-ink">{partner.name}</span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-ink"
                      style={{ background: kindTint(partner.kind, 0.35) }}
                    >
                      {partner.matchScore}
                    </span>
                  </span>
                  <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-[#eef0f4]">
                    <motion.span
                      className="block h-full rounded-full"
                      style={{ background: barColor }}
                      initial={reduced ? false : { width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.4, delay: index * 0.015, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HeatPanel({
  partners,
  anchors,
  selectedId,
  reduced,
  onSelect,
}: {
  partners: Partner[];
  anchors: string[];
  selectedId: string;
  reduced: boolean;
  onSelect: (id: string) => void;
}) {
  const ranked = partners;
  const cols = anchors.length > 0 ? anchors : ["taste"];
  const [focusCol, setFocusCol] = useState<number | null>(null);

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden">
      <div className="flex flex-wrap gap-1">
        {cols.map((anchor, index) => (
          <span
            key={anchor}
            className="max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-bold text-ink"
            style={{ background: HEAT_PALETTE[index % HEAT_PALETTE.length] }}
            title={anchor}
          >
            {anchor}
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-1">
          <thead>
            <tr>
              <th className="w-[42%]" />
              {cols.map((anchor, col) => (
                <th
                  key={anchor}
                  onPointerEnter={() => setFocusCol(col)}
                  onPointerLeave={() => setFocusCol(null)}
                  className="truncate px-0.5 pb-0.5 text-center text-[9px] font-bold text-ink-soft"
                  title={anchor}
                >
                  {anchor}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map((partner, row) => {
              const active = partner.id === selectedId;
              const color = partnerColor(partner.kind);
              return (
                <tr key={partner.id}>
                  <th scope="row" className="p-0 text-left">
                    <button
                      type="button"
                      onClick={() => onSelect(partner.id)}
                      title={partner.name}
                      className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left transition"
                      style={
                        active
                          ? { background: kindTint(partner.kind, 0.35), boxShadow: `inset 0 0 0 1px ${color}66` }
                          : undefined
                      }
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 truncate text-[10px] font-bold text-ink">{partner.name}</span>
                    </button>
                  </th>
                  {cols.map((anchor, col) => {
                    const strength = heatCell(partner, anchor, col);
                    const lit = active || focusCol === col;
                    const alpha = lit ? 0.28 + strength * 0.65 : 0.12 + strength * 0.32;
                    const value = Math.round(strength * partner.matchScore);
                    return (
                      <td key={`${partner.id}-${anchor}`} className="p-0">
                        <motion.button
                          type="button"
                          onClick={() => onSelect(partner.id)}
                          onPointerEnter={() => setFocusCol(col)}
                          onPointerLeave={() => setFocusCol(null)}
                          className="grid h-7 w-full place-items-center rounded-md text-[9px] font-extrabold tabular-nums"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, white)`,
                            color: alpha > 0.55 ? "#fff" : "#14151a",
                          }}
                          initial={reduced ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: (row * cols.length + col) * 0.015, duration: 0.18 }}
                          aria-label={`${partner.name} × ${anchor}: ${value}`}
                        >
                          {value}
                        </motion.button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

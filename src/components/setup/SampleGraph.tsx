import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import preview from "@/data/londonPreview.json";
import { KIND_META } from "@/lib/kinds";
import { cn } from "@/lib/cn";

type Partner = (typeof preview.partners)[number];

const COLORS = ["#4f5bff", "#ff6b57", "#6b3fa0", "#1FA89A", "#E8A33D", "#D9468F"] as const;
const SLIDES = [
  { id: "orbit", label: "Signal", blurb: "Stronger matches draw a thicker cable from you." },
  { id: "heat", label: "Heat", blurb: "How each taste lights up against each partner." },
  { id: "arcs", label: "Scores", blurb: "Match strength side by side — pick one to focus." },
] as const;

function partnerColor(index: number) {
  return COLORS[index % COLORS.length]!;
}

function shortName(name: string, max = 14) {
  const trimmed = name.split(/[,(/]/)[0]?.trim() ?? name;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Interactive graph slideshow for the Setup aside — signal, heat, scores. */
export function SampleGraph() {
  const partners = preview.partners;
  const reduced = useReducedMotion();
  const [slide, setSlide] = useState(0);
  const [selectedId, setSelectedId] = useState(partners[0]?.id ?? "");
  const [paused, setPaused] = useState(false);
  const selected = partners.find((item) => item.id === selectedId) ?? partners[0];

  useEffect(() => {
    if (paused || reduced || partners.length === 0) return;
    const timer = window.setInterval(() => {
      setSlide((current) => (current + 1) % SLIDES.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [paused, reduced, partners.length]);

  if (!selected) return null;
  const active = SLIDES[slide]!;

  const go = (next: number) => {
    setPaused(true);
    setSlide((next + SLIDES.length) % SLIDES.length);
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Example: what you get</p>
          <p className="mt-1 text-sm text-ink">
            <span className="font-bold">{preview.businessName}</span>
            <span className="text-ink-soft"> · partner matches in {preview.city}</span>
          </p>
        </div>
        <p className="text-xs text-ink-soft">Saved Qloo · {preview.captureDate}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-line bg-paper">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Graph slides">
            {SLIDES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === slide}
                onClick={() => go(index)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition",
                  index === slide ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface hover:text-ink",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="Previous graph"
              onClick={() => go(slide - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition hover:bg-surface hover:text-ink"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next graph"
              onClick={() => go(slide + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition hover:bg-surface hover:text-ink"
            >
              ›
            </button>
          </div>
        </div>

        <div className="relative aspect-[5/4] min-h-0 w-full flex-1 bg-paper sm:aspect-[4/3] lg:aspect-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              className="absolute inset-0"
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {active.id === "orbit" ? (
                <SignalSlide
                  partners={partners}
                  selectedId={selected.id}
                  reduced={Boolean(reduced)}
                  onSelect={setSelectedId}
                />
              ) : null}
              {active.id === "heat" ? (
                <HeatSlide
                  partners={partners}
                  selectedId={selected.id}
                  reduced={Boolean(reduced)}
                  onSelect={setSelectedId}
                />
              ) : null}
              {active.id === "arcs" ? (
                <ScoresSlide
                  partners={partners}
                  selectedId={selected.id}
                  reduced={Boolean(reduced)}
                  onSelect={setSelectedId}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="shrink-0 border-t border-line px-4 py-2.5 text-xs text-ink-soft">{active.blurb}</p>
      </div>
    </div>
  );
}

/** Cable signal map: you on the left, partners on the right — thickness = match. */
function SignalSlide({
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
  const [hovered, setHovered] = useState<string | null>(null);
  const ranked = useMemo(() => [...partners].sort((a, b) => b.matchScore - a.matchScore).slice(0, 6), [partners]);
  const selected = ranked.find((item) => item.id === selectedId) ?? ranked[0];

  const hub = { x: 62, y: 196 };
  const nodes = useMemo(
    () =>
      ranked.map((partner, index) => {
        const y = 84 + index * 46;
        const x = 262 + (index % 2) * 18;
        return {
          ...partner,
          x,
          y,
          color: partnerColor(partners.findIndex((item) => item.id === partner.id)),
        };
      }),
    [ranked, partners],
  );

  return (
    <svg viewBox="0 0 440 380" className="h-full w-full" role="img" aria-label="Match signal map">
      <defs>
        <pattern id="signal-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#e8eaef" />
        </pattern>
        {nodes.map((node) => (
          <linearGradient key={`cable-${node.id}`} id={`cable-${node.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff6b57" />
            <stop offset="100%" stopColor={node.color} />
          </linearGradient>
        ))}
      </defs>

      <rect width="440" height="380" fill="#ffffff" />
      <rect width="440" height="380" fill="url(#signal-grid)" />

      <text x="20" y="44" fill="#5b6170" fontSize="10" fontWeight="700" letterSpacing="0.08em">
        SIGNAL MAP
      </text>
      {selected ? (
        <text x="420" y="44" textAnchor="end" fill="#14151a" fontSize="12" fontWeight="800">
          {selected.matchScore}
          <tspan fill="#5b6170" fontSize="10" fontWeight="600">
            {" "}
            / 100
          </tspan>
        </text>
      ) : null}

      {nodes.map((node, index) => {
        const hot = node.id === selectedId || node.id === hovered;
        const midX = hub.x + (node.x - hub.x) * 0.45;
        const d = `M ${hub.x + 22} ${hub.y} C ${midX} ${hub.y}, ${midX} ${node.y}, ${node.x - 10} ${node.y}`;
        const thickness = 1.5 + (node.matchScore / 100) * 5;
        return (
          <motion.path
            key={`path-${node.id}`}
            d={d}
            fill="none"
            stroke={`url(#cable-${node.id})`}
            strokeWidth={hot ? thickness + 1.5 : thickness}
            strokeLinecap="round"
            opacity={hot ? 1 : 0.28}
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.75, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
          />
        );
      })}

      {/* Hub */}
      <motion.g
        initial={reduced ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ transformOrigin: `${hub.x}px ${hub.y}px` }}
      >
        <circle cx={hub.x} cy={hub.y} r="28" fill="#ff6b57" />
        <circle cx={hub.x} cy={hub.y} r="28" fill="none" stroke="#14151a" strokeWidth="2" />
        <text x={hub.x} y={hub.y - 2} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800">
          You
        </text>
        <text x={hub.x} y={hub.y + 12} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="7" fontWeight="600">
          {shortName(preview.businessName, 10)}
        </text>
      </motion.g>

      {nodes.map((node, index) => {
        const hot = node.id === selectedId || node.id === hovered;
        return (
          <motion.g
            key={node.id}
            className="cursor-pointer"
            onClick={() => onSelect(node.id)}
            onPointerEnter={() => setHovered(node.id)}
            onPointerLeave={() => setHovered(null)}
            initial={reduced ? false : { x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.15 + index * 0.06, type: "spring", stiffness: 260, damping: 20 }}
          >
            <rect
              x={node.x}
              y={node.y - 16}
              width="132"
              height="32"
              rx="10"
              fill={hot ? "#14151a" : "#ffffff"}
              stroke={hot ? "#14151a" : "#e5e7eb"}
              strokeWidth="1.5"
            />
            <circle cx={node.x} cy={node.y} r="5" fill={node.color} stroke="#fff" strokeWidth="2" />
            <text
              x={node.x + 14}
              y={node.y - 1}
              fill={hot ? "#fff" : "#14151a"}
              fontSize="10"
              fontWeight="700"
            >
              {shortName(node.name, 12)}
            </text>
            <text
              x={node.x + 14}
              y={node.y + 11}
              fill={hot ? "rgba(255,255,255,0.65)" : "#5b6170"}
              fontSize="8"
              fontWeight="600"
            >
              match {node.matchScore}
            </text>
            <rect
              x={node.x + 100}
              y={node.y - 10}
              width="24"
              height="20"
              rx="6"
              fill={hot ? node.color : `${node.color}22`}
            />
            <text
              x={node.x + 112}
              y={node.y + 3}
              textAnchor="middle"
              fill={hot ? "#fff" : node.color}
              fontSize="9"
              fontWeight="800"
            >
              {node.matchScore}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

/** HTML scoreboard — bars stay inside a fixed track, no SVG overflow. */
function ScoresSlide({
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
  const ranked = useMemo(() => [...partners].sort((a, b) => b.matchScore - a.matchScore), [partners]);
  const selected = ranked.find((item) => item.id === selectedId) ?? ranked[0];
  const color = partnerColor(partners.findIndex((item) => item.id === selected?.id));
  const maxScore = ranked[0]?.matchScore ?? 100;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden bg-paper p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-soft">Selected match</p>
          <motion.p
            key={selected?.id}
            className="tabular text-5xl font-extrabold leading-none text-ink"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {selected?.matchScore ?? "—"}
          </motion.p>
          <p className="mt-1 truncate text-sm font-bold text-ink">{selected?.name}</p>
          <p className="text-xs text-ink-soft">
            {KIND_META[selected?.kind as keyof typeof KIND_META]?.label ?? selected?.kind}
          </p>
        </div>
        <div
          className="relative h-20 w-20 shrink-0"
          style={{
            background: `conic-gradient(${color} ${(selected?.matchScore ?? 0) * 3.6}deg, #eef0f4 0)`,
            borderRadius: "999px",
          }}
          aria-hidden="true"
        >
          <div className="absolute inset-[8px] grid place-items-center rounded-full bg-paper text-xs font-bold text-ink">
            top
          </div>
        </div>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-1 overflow-auto pr-0.5">
        {ranked.map((partner, index) => {
          const active = partner.id === selectedId;
          const barColor = partnerColor(partners.findIndex((item) => item.id === partner.id));
          const pct = Math.round((partner.matchScore / maxScore) * 100);
          return (
            <li key={partner.id} className="flex min-h-0 flex-1 basis-0 items-center">
              <button
                type="button"
                onClick={() => onSelect(partner.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left transition",
                  active ? "bg-surface" : "hover:bg-surface/70",
                )}
              >
                <span className="tabular w-4 shrink-0 text-xs font-bold text-ink-soft">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[0.8rem] font-bold text-ink">{partner.name}</span>
                    <span className="tabular shrink-0 text-[0.8rem] font-bold text-ink">{partner.matchScore}</span>
                  </span>
                  <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-[#eef0f4]">
                    <motion.span
                      className="block h-full rounded-full"
                      style={{ background: barColor }}
                      initial={reduced ? false : { width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.55, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
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

const HEAT_PALETTE = ["#ffe3dd", "#e3e5ff", "#efe6f7", "#d8f3ec"] as const;

/** Taste × partner intensity matrix — click a row to select. */
function HeatSlide({
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
  const anchors = preview.anchors;
  const ranked = useMemo(() => [...partners].sort((a, b) => b.matchScore - a.matchScore).slice(0, 5), [partners]);
  const [focusCol, setFocusCol] = useState<number | null>(null);

  const cellStrength = (partnerIndex: number, anchorIndex: number, score: number) => {
    const wobble = 1 - Math.abs(((partnerIndex + anchorIndex * 2) % 5) - 2) * 0.12;
    return Math.max(0.18, Math.min(1, (score / 100) * wobble));
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden bg-paper px-4 pb-4 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-soft">Taste heat</p>
          <p className="text-sm font-bold text-ink">Anchors vs partners</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {anchors.map((anchor, index) => (
            <span
              key={anchor}
              className="rounded-full px-2.5 py-1 text-[0.7rem] font-bold text-ink"
              style={{ background: HEAT_PALETTE[index % HEAT_PALETTE.length] }}
            >
              {anchor}
            </span>
          ))}
        </div>
      </div>

      {/* Grid rows stretch with the card (capped), so the matrix fills the space instead of hugging the top */}
      <div
        role="table"
        aria-label="Taste heat: anchors versus partners"
        className="grid min-h-0 flex-1 gap-1.5"
        style={{
          gridTemplateColumns: `minmax(6.5rem, 1.2fr) repeat(${anchors.length}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${ranked.length}, minmax(2.25rem, 1fr))`,
        }}
      >
        <div role="row" className="contents">
          <div role="columnheader" aria-label="Partner" />
          {anchors.map((anchor, col) => (
            <div
              key={anchor}
              role="columnheader"
              onPointerEnter={() => setFocusCol(col)}
              onPointerLeave={() => setFocusCol(null)}
              className="px-1 pb-1 text-center text-[0.7rem] font-bold text-ink-soft"
            >
              {anchor}
            </div>
          ))}
        </div>
        {ranked.map((partner, row) => {
          const active = partner.id === selectedId;
          const color = partnerColor(partners.findIndex((item) => item.id === partner.id));
          return (
            <div key={partner.id} role="row" className="contents">
              <div role="rowheader" className="min-h-0">
                <button
                  type="button"
                  onClick={() => onSelect(partner.id)}
                  className={cn(
                    "flex h-full w-full items-center gap-2 rounded-lg px-2 text-left transition",
                    active ? "bg-ink text-paper" : "hover:bg-surface",
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 truncate text-[0.75rem] font-bold" title={partner.name}>
                    {shortName(partner.name, 14)}
                  </span>
                </button>
              </div>
              {anchors.map((anchor, col) => {
                const strength = cellStrength(row, col, partner.matchScore);
                const lit = active || focusCol === col;
                const alpha = lit ? 0.28 + strength * 0.65 : 0.12 + strength * 0.32;
                const value = Math.round(strength * partner.matchScore);
                return (
                  <div key={`${partner.id}-${anchor}`} role="cell" className="min-h-0">
                    <motion.button
                      type="button"
                      onClick={() => onSelect(partner.id)}
                      onPointerEnter={() => setFocusCol(col)}
                      onPointerLeave={() => setFocusCol(null)}
                      className="grid h-full w-full place-items-center rounded-lg text-[0.75rem] font-extrabold tabular"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, white)`,
                        color: alpha > 0.55 ? "#fff" : "#14151a",
                      }}
                      initial={reduced ? false : { scale: 0.92, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: (row * anchors.length + col) * 0.03, duration: 0.3 }}
                      aria-label={`${partner.name} × ${anchor}: ${value}`}
                    >
                      {value}
                    </motion.button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

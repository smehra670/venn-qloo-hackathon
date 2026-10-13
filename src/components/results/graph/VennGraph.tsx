import type { Partner } from "@shared/types";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { GraphControls } from "@/components/results/graph/GraphControls";
import { Legend } from "@/components/results/graph/Legend";
import { layoutGraph } from "@/components/results/graph/useGraphLayout";
import { SurpriseSlider } from "@/components/ui/SurpriseSlider";
import { businessLabel } from "@/lib/format";
import { KIND_META } from "@/lib/kinds";
import { useVenn } from "@/store/useVenn";

function rankOf(partner: Partner, surprise: number): number {
  return (1 - surprise) * partner.matchScore + surprise * (0.5 * partner.matchScore + 50 * partner.surprise);
}

export function VennGraph() {
  const result = useVenn((state) => state.result);
  const surprise = useVenn((state) => state.surprise);
  const setSurprise = useVenn((state) => state.setSurprise);
  const kindFilter = useVenn((state) => state.kindFilter);
  const toggleKind = useVenn((state) => state.toggleKind);
  const selectedId = useVenn((state) => state.selectedId);
  const hoverId = useVenn((state) => state.hoverId);
  const selectPartner = useVenn((state) => state.select);
  const setHover = useVenn((state) => state.setHover);
  const pinnedIds = useVenn((state) => state.pinnedIds);
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const seen = useRef(new Set<string>());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.6])
      .on("zoom", (event: { transform: ZoomTransform }) => {
        groupRef.current?.setAttribute("transform", event.transform.toString());
        const next = event.transform.k > 1.3;
        setZoomed((current) => (current === next ? current : next));
      });
    zoomRef.current = behaviour;
    select(svg).call(behaviour);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  const visible = useMemo(() => {
    if (!result) return [];
    const filtered = result.partners.filter((partner) => kindFilter.has(partner.kind));
    const ranked = [...filtered].sort((a, b) => rankOf(b, surprise) - rankOf(a, surprise));
    const keep = new Set(ranked.slice(0, 14).map((partner) => partner.id));
    for (const id of pinnedIds) {
      if (filtered.some((partner) => partner.id === id)) keep.add(id);
    }
    if (selectedId && filtered.some((partner) => partner.id === selectedId)) keep.add(selectedId);
    return filtered.filter((partner) => keep.has(partner.id));
  }, [result, kindFilter, surprise, pinnedIds, selectedId]);

  const layout = useMemo(
    () => (size.width > 0 ? layoutGraph(visible, size.width, size.height) : null),
    [visible, size.width, size.height],
  );

  if (!result) return null;
  const label = businessLabel(result.input);
  const topLabels = new Set(
    [...visible].sort((a, b) => b.matchScore - a.matchScore).slice(0, 6).map((partner) => partner.id),
  );
  const byId = new Map(layout?.nodes.map((node) => [node.id, node]) ?? []);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    const behaviour = zoomRef.current;
    if (!svg || !behaviour) return;
    behaviour.scaleBy(select(svg), factor);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 px-3 pt-3">
        <Legend partners={result.partners} active={kindFilter} onToggle={toggleKind} />
        <div className="ml-auto w-full max-w-xs rounded-[20px] border border-line bg-card/95 p-3 shadow-soft sm:w-64">
          <SurpriseSlider value={surprise} onChange={setSurprise} />
        </div>
      </div>
      <div ref={hostRef} className="relative min-h-0 flex-1">
      <GraphControls onZoomIn={() => zoomBy(1.2)} onZoomOut={() => zoomBy(0.8)} onReset={() => {
        const svg = svgRef.current;
        const behaviour = zoomRef.current;
        if (!svg || !behaviour) return;
        behaviour.transform(select(svg), zoomIdentity);
      }} />
      {layout ? (
        <svg
          ref={svgRef}
          width={size.width}
          height={size.height}
          role="group"
          aria-label={`${label} in the centre, with ${visible.length} partner circles. Overlap shows match, relative to this search.`}
          className="touch-none"
          onClick={() => selectPartner(null)}
        >
          <g ref={groupRef}>
            <clipPath id="venn-business-clip">
              <circle cx={layout.cx} cy={layout.cy} r={layout.businessR} />
            </clipPath>
            <circle cx={layout.cx} cy={layout.cy} r={layout.businessR} fill="#FF6B57" fillOpacity={0.55} />
            <text x={layout.cx} y={layout.cy} textAnchor="middle" className="fill-ink font-serif text-lg" style={{ paintOrder: "stroke", stroke: "#F6F2EA", strokeWidth: 5 }}>
              {label}
            </text>
            {visible.map((partner, index) => {
              const node = byId.get(partner.id);
              if (!node) return null;
              const fresh = !seen.current.has(partner.id);
              const dim = hoverId !== null && hoverId !== partner.id && !partner.relatedIds.includes(hoverId);
              const showLabel = zoomed || topLabels.has(partner.id) || hoverId === partner.id || selectedId === partner.id;
              return (
                <motion.g
                  key={partner.id}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: dim ? 0.35 : 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.15 }}
                  onMouseEnter={() => setHover(partner.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectPartner(partner.id);
                  }}
                >
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill={KIND_META[partner.kind].color}
                    fillOpacity={0.5}
                    tabIndex={0}
                    role="button"
                    aria-label={`${partner.name}, ${KIND_META[partner.kind].label}, match ${partner.matchScore}${partner.userAdded ? ", your pick" : ""}`}
                    initial={reduced || !fresh ? false : { cx: layout.cx, cy: layout.cy }}
                    animate={{ cx: node.x, cy: node.y }}
                    transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 18, delay: fresh ? index * 0.04 : 0 }}
                    onAnimationComplete={() => seen.current.add(partner.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectPartner(partner.id);
                      }
                    }}
                    stroke={partner.userAdded || selectedId === partner.id ? "#3E49E6" : "transparent"}
                    strokeWidth={partner.userAdded || selectedId === partner.id ? 3 : 0}
                    strokeDasharray={partner.userAdded ? "6 4" : undefined}
                  />
                  <motion.circle
                    r={node.r}
                    fill="#6B3FA0"
                    fillOpacity={0.45}
                    clipPath="url(#venn-business-clip)"
                    initial={false}
                    animate={{ cx: node.x, cy: node.y }}
                    transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 18, delay: fresh ? index * 0.04 : 0 }}
                    style={{ pointerEvents: "none" }}
                  />
                  {showLabel ? (
                    <text
                      x={node.x + ((node.x - layout.cx) / (Math.hypot(node.x - layout.cx, node.y - layout.cy) || 1)) * (node.r + 4)}
                      y={node.y + ((node.y - layout.cy) / (Math.hypot(node.x - layout.cx, node.y - layout.cy) || 1)) * (node.r + 14)}
                      textAnchor={node.x > layout.cx + 12 ? "start" : node.x < layout.cx - 12 ? "end" : "middle"}
                      className="fill-ink font-serif text-[13px]"
                      style={{ paintOrder: "stroke", stroke: "#F6F2EA", strokeWidth: 5 }}
                    >
                      {partner.name}
                      {hoverId === partner.id || selectedId === partner.id ? ` · ${partner.matchScore}` : ""}
                    </text>
                  ) : null}
                </motion.g>
              );
            })}
            {hoverId
              ? visible
                  .find((partner) => partner.id === hoverId)
                  ?.relatedIds.map((relatedId) => {
                    const from = byId.get(hoverId);
                    const to = byId.get(relatedId);
                    if (!from || !to) return null;
                    return (
                      <path
                        key={relatedId}
                        d={`M ${from.x} ${from.y} Q ${layout.cx} ${layout.cy} ${to.x} ${to.y}`}
                        fill="none"
                        stroke="#1B1A2E"
                        strokeOpacity={0.28}
                        pointerEvents="none"
                      />
                    );
                  })
              : null}
          </g>
        </svg>
      ) : null}
      {visible.length === 0 ? (
        <p className="absolute inset-x-0 top-1/2 text-center text-ink-soft">Turn a type back on to see partners.</p>
      ) : null}
      </div>
    </div>
  );
}

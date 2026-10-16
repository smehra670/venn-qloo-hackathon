import { useMemo, type CSSProperties } from "react";
import type { Partner } from "@shared/types";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { bindPartnerPointer, type TipLine } from "@/components/results/overview/OverviewTip";
import {
  distFor,
  hasQlooPopularity,
  kindLabel,
  overlapFraction,
  pct,
  popularityRadius,
  score01,
} from "@/lib/overviewModel";
import { cn } from "@/lib/cn";

const OC = { x: 350, y: 290, R: 175 };
const NARROW =
  typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false;

function tipLines(p: Partner): TipLine[] {
  const dist = p.venueFacts?.distanceM;
  return [
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
}

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
  const layout = useMemo(() => {
    const items = partners.slice(0, 12).map((p, i, arr) => {
      const r = popularityRadius(p);
      const f = overlapFraction(p);
      const d = distFor(f, OC.R, r);
      const angle = -Math.PI / 2 + (i / Math.max(arr.length, 1)) * Math.PI * 2;
      return {
        p,
        r,
        d,
        x: OC.x + d * Math.cos(angle),
        y: OC.y + d * Math.sin(angle),
        angle,
      };
    });
    return items;
  }, [partners]);

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

  const title =
    byKind.length > 1
      ? `${kindLabel(byKind[0]![0] as Partner["kind"])} sits closest to your crowd, then ${kindLabel(byKind[1]![0] as Partner["kind"])}`
      : byKind.length === 1
        ? `Every ${kindLabel(byKind[0]![0] as Partner["kind"])} partner here shares a slice of your crowd`
        : "Your crowd and theirs";

  const subtitle = `${partners.length} partner${partners.length === 1 ? "" : "s"} placed by how much of their crowd is also yours. The deeper inside your circle, the more taste you share.`;

  const anyPop = partners.some(hasQlooPopularity);
  const viewBox = NARROW
    ? `${OC.x - (OC.R + 58)} ${OC.y - (OC.R + 58)} ${(OC.R + 58) * 2} ${(OC.R + 58) * 2}`
    : "0 0 760 700";

  return (
    <ChartCard
      id="c-orbit"
      className="ov-orbit"
      title={title}
      subtitle={subtitle}
      note="Closer and a bigger lens mean a stronger taste overlap. It is an illustration of the score, not a count of people."
      legend={
        <div className="ov-key">
          <span>
            <i style={{ background: "var(--ov-coral)" }} />
            You
          </span>
          <span>
            <i style={{ background: "var(--ov-blue)" }} />
            Partner{anyPop ? ", bigger means busier" : ""}
          </span>
          <span>
            <i className="lens" />
            Shared taste
          </span>
        </div>
      }
      chart={
        <svg viewBox={viewBox} role="img" aria-label="Orbit chart: partners placed by taste overlap with you">
          <defs>
            <clipPath id="youclip">
              <circle cx={OC.x} cy={OC.y} r={OC.R} />
            </clipPath>
          </defs>
          <circle cx={OC.x} cy={OC.y} r={OC.R} fill="#FFE8E3" />
          {layout.map(({ p, r, x, y }, i) => {
            const hl = hoverId === p.id || selectedId === p.id;
            const dim = Boolean(hoverId) && hoverId !== p.id;
            const bind = bindPartnerPointer(p.id, {
              setHover,
              select,
              lines: () => tipLines(p),
            });
            const mvStyle: CSSProperties = {
              transform: `translate(${x}px, ${y}px)`,
              transitionDelay: `${i * 55}ms`,
            };
            return (
              <g
                key={p.id}
                className={cn("ov-pn", hl && "hl", selectedId === p.id && "sel")}
                style={{ opacity: dim ? 0.22 : 1 }}
                {...bind}
                aria-label={`${p.name}, ${Math.round(p.matchScore)} overlap, ${kindLabel(p.kind)}`}
              >
                {/* Blue partner + plum lens both at partner origin; plum clipped by You (CSS transform keeps clipPath absolute) */}
                <g className="ov-mv" style={mvStyle}>
                  <circle r={r} fill="#4F5BFF" stroke="#fff" strokeWidth={2} />
                  <circle className="ov-fr" r={r + 5} fill="none" stroke="#14151A" strokeWidth={2} />
                  <circle r={Math.max(r, 14) + 4} fill="transparent" />
                </g>
                <g clipPath="url(#youclip)">
                  <g className="ov-mv" style={mvStyle}>
                    <circle
                      r={Math.max(r - 1, 4)}
                      fill="#6B3FA0"
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                </g>
                {!NARROW ? (
                  <text className="ov-lblc ov-lb" x={x} y={y + r + 16} textAnchor="middle">
                    {p.name}
                  </text>
                ) : null}
              </g>
            );
          })}
          <circle cx={OC.x} cy={OC.y} r={OC.R} fill="none" stroke="#FF6B57" strokeWidth={2} pointerEvents="none" />
          <text x={OC.x} y={OC.y - 2} textAnchor="middle" fontSize={17} fontWeight={700} fill="#14151A" pointerEvents="none">
            {youName}
          </text>
          <text x={OC.x} y={OC.y + 17} textAnchor="middle" fontSize={12.5} fontWeight={500} fill="#596070" pointerEvents="none">
            your crowd
          </text>
        </svg>
      }
      table={
        <DataTable
          head={["Partner", "Kind", "Overlap", "Busy (Qloo)"]}
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
          ])}
        />
      }
    />
  );
}

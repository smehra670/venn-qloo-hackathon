import { useMemo } from "react";
import type { Partner } from "@shared/types";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { bindPartnerPointer, type TipLine } from "@/components/results/overview/OverviewTip";
import {
  hasQlooPopularity,
  kindLabel,
  pct,
  popularityRadius,
  score01,
  yAxisValue,
} from "@/lib/overviewModel";
import { cn } from "@/lib/cn";

const NARROW =
  typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false;

const QD = NARROW
  ? { W: 360, H: 470, l: 38, r: 12, t: 38, b: 52 }
  : { W: 640, H: 540, l: 44, r: 20, t: 40, b: 54 };

function qx(v: number) {
  return QD.l + ((v - 0.5) / 0.5) * (QD.W - QD.l - QD.r);
}
function qy(v: number) {
  return QD.t + (1 - (v - 0.1) / 0.9) * (QD.H - QD.t - QD.b);
}

export function ScatterPanel({
  partners,
  surprise,
  selectedId,
  hoverId,
  setHover,
  select,
}: {
  partners: Partner[];
  surprise: number;
  selectedId: string | null;
  hoverId: string | null;
  setHover: (id: string | null) => void;
  select: (id: string | null) => void;
}) {
  const wild = surprise >= 0.5;
  const thr = 0.75 - surprise * 0.15;

  const pts = useMemo(
    () =>
      partners.map((p) => {
        const x = score01(p);
        const y = yAxisValue(p, surprise);
        const r = 7 + (hasQlooPopularity(p) ? p.scoreBasis!.popularity : 0.45) * 10;
        return { p, x, y, r, px: qx(x), py: qy(y) };
      }),
    [partners, surprise],
  );

  const inZone = pts.filter((t) => t.x >= thr && t.y >= 0.6).length;
  const title = wild
    ? inZone
      ? `${inZone} bold bet${inZone === 1 ? "" : "s"} still ${inZone === 1 ? "shares" : "share"} your taste`
      : "No bold bets clear the bar yet"
    : inZone
      ? `${inZone} partner${inZone === 1 ? " is" : "s are"} both close in taste and easy to reach`
      : "No partner is both close in taste and easy to reach yet";

  const subtitle = wild
    ? "Overlap comes from Qloo. Surprise is Venn’s estimate of how far a partner sits from what you already do."
    : "Overlap comes from Qloo. Ease is Venn’s estimate from distance, size and how reachable the owner is.";

  return (
    <ChartCard
      id="c-quad"
      className="ov-quad"
      title={title}
      subtitle={subtitle}
      legend={
        <div className="ov-key">
          <span>
            <i style={{ background: "var(--ov-blue)" }} />
            Local place
          </span>
          <span>
            <i className="ring" />
            Brand, no location
          </span>
          {partners.some(hasQlooPopularity) ? (
            <span>Bubble size shows how busy the place is</span>
          ) : null}
        </div>
      }
      chart={
        <svg
          viewBox={`0 0 ${QD.W} ${QD.H}`}
          role="img"
          aria-label="Scatter chart of taste overlap against ease of approach"
        >
          <rect
            x={qx(thr)}
            y={qy(1)}
            width={qx(1) - qx(thr)}
            height={qy(0.6) - qy(1)}
            rx={16}
            fill="#EDE5F7"
            fillOpacity={0.6}
          />
          {Array.from({ length: 5 }, (_, i) => {
            const v = 0.1 + i * 0.225;
            return (
              <line
                key={v}
                x1={QD.l}
                x2={QD.W - QD.r}
                y1={qy(v)}
                y2={qy(v)}
                stroke="#EBEDF1"
                strokeWidth={1}
              />
            );
          })}
          {Array.from({ length: 6 }, (_, i) => {
            const v = 0.5 + i * 0.1;
            return (
              <g key={v}>
                <line x1={qx(v)} x2={qx(v)} y1={qy(1)} y2={qy(0.1)} stroke="#EBEDF1" strokeWidth={1} />
                <text className="ov-ax" x={qx(v)} y={QD.H - QD.b + 20} textAnchor="middle">
                  {Math.round(v * 100)}
                </text>
              </g>
            );
          })}
          <line x1={QD.l} x2={QD.W - QD.r} y1={qy(0.1)} y2={qy(0.1)} stroke="#C4C9D2" strokeWidth={1} />
          <text className="ov-axt" x={(QD.l + QD.W - QD.r) / 2} y={QD.H - 8} textAnchor="middle">
            {NARROW ? "Taste overlap with you" : "Taste overlap with you (higher is closer)"}
          </text>
          <text className="ov-axt" x={0} y={14}>
            {wild ? "More surprising ↑" : "Easier to approach ↑"}
          </text>
          <text className="ov-ax" x={QD.l - 8} y={qy(1) + 4} textAnchor="end">
            {wild ? "Bold" : "Easy"}
          </text>
          <text className="ov-ax" x={QD.l - 8} y={qy(0.1) + 4} textAnchor="end">
            {wild ? "Obvious" : "Hard"}
          </text>
          <text className="ov-zone" x={qx(1) - 12} y={qy(1) + 22} textAnchor="end">
            {wild ? "Bold bets" : "Message first"}
          </text>
          {pts.map(({ p, px, py, r }) => {
            const hl = hoverId === p.id || selectedId === p.id;
            const dim = Boolean(hoverId) && hoverId !== p.id;
            const bind = bindPartnerPointer(p.id, {
              setHover,
              select,
              lines: (): TipLine[] => [
                { className: "v", text: `${Math.round(p.matchScore)} overlap` },
                { className: "l", text: `${p.name} · ${kindLabel(p.kind)}` },
                {
                  className: "l",
                  text: `${wild ? "Surprise" : "Ease of approach"}: ${pct(yAxisValue(p, surprise))} of 100 (Venn’s estimate)`,
                },
              ],
            });
            return (
              <g
                key={p.id}
                className={cn("ov-qb", hl && "hl", selectedId === p.id && "sel")}
                style={{ opacity: dim ? 0.22 : 1 }}
                transform={`translate(${px}, ${py})`}
                {...bind}
                aria-label={`${p.name}, ${Math.round(p.matchScore)} overlap`}
              >
                {p.local && p.venueFacts ? (
                  <circle r={r} fill="#4F5BFF" stroke="#fff" strokeWidth={2} />
                ) : (
                  <circle r={Math.max(r - 1, 5)} fill="#fff" stroke="#4F5BFF" strokeWidth={2.5} />
                )}
                <circle className="ov-fr" r={r + 5} fill="none" stroke="#14151A" strokeWidth={2} />
                <text className="ov-lblc" x={r + 6} y={4} textAnchor="start">
                  {p.name}
                </text>
              </g>
            );
          })}
        </svg>
      }
      table={
        <DataTable
          head={["Partner", "Overlap", wild ? "Surprise (Venn)" : "Ease (Venn)", "Busy"]}
          rowIds={partners.map((p) => p.id)}
          selectedId={selectedId}
          hoverId={hoverId}
          onRowFocus={setHover}
          onRowSelect={select}
          rows={partners.map((p) => [
            p.name,
            String(Math.round(p.matchScore)),
            String(pct(yAxisValue(p, surprise))),
            hasQlooPopularity(p) ? String(pct(p.scoreBasis!.popularity)) : "—",
          ])}
        />
      }
    />
  );
}

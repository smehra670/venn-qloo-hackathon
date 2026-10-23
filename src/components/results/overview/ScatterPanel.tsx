import { useMemo } from "react";
import type { Partner } from "@shared/types";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { bindPartnerPointer, type TipLine } from "@/components/results/overview/OverviewTip";
import { partnerOpacity, tasteTipLine, useTasteFocus } from "@/components/results/overview/tasteFocus";
import {
  hasQlooPopularity,
  PARTNER_BLUE,
  kindLabel,
  pct,
  score01,
  yAxisValue,
} from "@/lib/overviewModel";
import { cn } from "@/lib/cn";

const NARROW =
  typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false;

const QD = NARROW
  ? { W: 360, H: 440, l: 40, r: 14, t: 36, b: 50 }
  : { W: 640, H: 430, l: 50, r: 26, t: 38, b: 52 };

const LABEL_CHAR_W = 6.5;
const LABEL_H = 15;

type Rect = { x: number; y: number; w: number; h: number };

const overlaps = (a: Rect, b: Rect, m = 3) =>
  a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

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
  const focus = useTasteFocus();
  const wild = surprise >= 0.5;
  const thr = 0.75 - surprise * 0.15;

  // X domain follows the data (never clips a low-scoring partner), rounded to a tidy tenth.
  const lo = useMemo(() => {
    const min = partners.length ? Math.min(...partners.map(score01)) : 0.5;
    return Math.max(0, Math.min(0.5, Math.floor((min - 0.03) * 10) / 10));
  }, [partners]);

  const qx = (v: number) => QD.l + ((v - lo) / (1 - lo)) * (QD.W - QD.l - QD.r);
  const qy = (v: number) => QD.t + (1 - (v - 0.1) / 0.9) * (QD.H - QD.t - QD.b);

  const pts = useMemo(
    () =>
      partners.map((p) => {
        const x = score01(p);
        const y = yAxisValue(p, surprise);
        const r = 7 + (hasQlooPopularity(p) ? p.scoreBasis!.popularity : 0.45) * 8;
        return { p, x, y, r, px: qx(x), py: qy(y) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- qx/qy derive from lo
    [partners, surprise, lo],
  );

  // Greedy label placement: right, left, above, below. A label that fits nowhere stays hidden
  // until the dot is hovered or selected, so nothing ever prints on top of anything else.
  const labels = useMemo(() => {
    const dots: Rect[] = pts.map(({ px, py, r }) => ({ x: px - r, y: py - r, w: r * 2, h: r * 2 }));
    const placed: Rect[] = [];
    const out = new Map<string, { x: number; y: number; anchor: "start" | "end" | "middle" }>();
    const order = [...pts].sort((a, b) => b.x - a.x || b.y - a.y);
    for (const { p, px, py, r } of order) {
      const w = p.name.length * LABEL_CHAR_W + 4;
      const cands = [
        { x: px + r + 6, y: py - LABEL_H / 2, anchor: "start" as const, rx: px + r + 6 },
        { x: px - r - 6, y: py - LABEL_H / 2, anchor: "end" as const, rx: px - r - 6 - w },
        { x: px, y: py - r - 6 - LABEL_H, anchor: "middle" as const, rx: px - w / 2 },
        { x: px, y: py + r + 6, anchor: "middle" as const, rx: px - w / 2 },
      ];
      for (const c of cands) {
        const rect: Rect = { x: c.rx, y: c.y, w, h: LABEL_H };
        const inside = rect.x >= 2 && rect.x + rect.w <= QD.W - 2 && rect.y >= 18 && rect.y + rect.h <= QD.H - QD.b + 6;
        if (!inside) continue;
        if (placed.some((o) => overlaps(rect, o))) continue;
        if (dots.some((d, i) => pts[i]!.p.id !== p.id && overlaps(rect, d, 1))) continue;
        placed.push(rect);
        out.set(p.id, { x: c.x, y: c.y + LABEL_H / 2 + 4, anchor: c.anchor });
        break;
      }
    }
    return out;
  }, [pts]);

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

  const ticks = Array.from({ length: Math.round((1 - lo) * 10) + 1 }, (_, i) => Math.round((lo + i * 0.1) * 10) / 10);

  return (
    <ChartCard
      id="c-quad"
      className="ov-quad"
      title={title}
      subtitle={subtitle}
      legend={
        <div className="ov-key">
          <span>
            <i style={{ background: "var(--ov-ink)" }} />
            Local place (filled)
          </span>
          <span>
            <i className="ring" />
            Brand, no location (ring)
          </span>
          {partners.some(hasQlooPopularity) ? <span>Bubble size shows how busy the place is</span> : null}
        </div>
      }
      chart={
        <svg
          viewBox={`0 0 ${QD.W} ${QD.H}`}
          role="group"
          aria-label="Scatter chart of taste overlap against ease of approach"
        >
          <rect
            x={qx(thr)}
            y={qy(1)}
            width={qx(1) - qx(thr)}
            height={qy(0.6) - qy(1)}
            rx={14}
            fill="#EDE5F7"
            fillOpacity={0.7}
          />
          {Array.from({ length: 5 }, (_, i) => {
            const v = 0.1 + i * 0.225;
            return (
              <line key={v} x1={QD.l} x2={QD.W - QD.r} y1={qy(v)} y2={qy(v)} stroke="#EBEDF1" strokeWidth={1} />
            );
          })}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={qx(v)} x2={qx(v)} y1={qy(1)} y2={qy(0.1)} stroke="#EBEDF1" strokeWidth={1} />
              <text className="ov-ax" x={qx(v)} y={QD.H - QD.b + 20} textAnchor="middle">
                {Math.round(v * 100)}
              </text>
            </g>
          ))}
          <line x1={QD.l} x2={QD.W - QD.r} y1={qy(0.1)} y2={qy(0.1)} stroke="#C4C9D2" strokeWidth={1} />
          <text className="ov-axt" x={(QD.l + QD.W - QD.r) / 2} y={QD.H - 8} textAnchor="middle">
            {NARROW ? "Taste overlap with you" : "Taste overlap with you (higher is closer)"}
          </text>
          <text className="ov-axt" x={2} y={16}>
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
            const opacity = partnerOpacity(p.id, { hoverId, focus, hoverDim: 0.22, tasteDim: 0.16 });
            const bind = bindPartnerPointer(p.id, {
              setHover,
              select,
              lines: (): TipLine[] => {
                const lines: TipLine[] = [
                  { className: "v", text: `${Math.round(p.matchScore)} overlap` },
                  { className: "l", text: `${p.name} · ${kindLabel(p.kind)}` },
                  {
                    className: "l",
                    text: `${wild ? "Surprise" : "Ease of approach"}: ${pct(yAxisValue(p, surprise))} of 100 (Venn’s estimate)`,
                  },
                ];
                const taste = tasteTipLine(focus, p);
                return taste ? [...lines, taste] : lines;
              },
            });
            const label = labels.get(p.id);
            // Hovered / selected dots always show their name, on the roomiest side.
            const forced = !label && hl ? { x: px < QD.W / 2 ? px + r + 6 : px - r - 6, anchor: px < QD.W / 2 ? ("start" as const) : ("end" as const) } : null;
            return (
              <g
                key={p.id}
                className={cn("ov-qb", hl && "hl", selectedId === p.id && "sel")}
                style={{ opacity }}
                transform={`translate(${px}, ${py})`}
                {...bind}
                aria-label={`${p.name}, ${Math.round(p.matchScore)} overlap`}
              >
                {p.local && p.venueFacts ? (
                  <circle r={r} fill={PARTNER_BLUE} stroke="#fff" strokeWidth={2} />
                ) : (
                  <circle r={Math.max(r - 1, 5)} fill="#fff" stroke={PARTNER_BLUE} strokeWidth={2.5} />
                )}
                <circle className="ov-fr" r={r + 5} fill="none" stroke="#14151A" strokeWidth={2} />
                {label ? (
                  <text className="ov-lblc" x={label.x - px} y={label.y - py} textAnchor={label.anchor}>
                    {p.name}
                  </text>
                ) : forced ? (
                  <text className="ov-lblc" x={forced.x - px} y={4} textAnchor={forced.anchor}>
                    {p.name}
                  </text>
                ) : null}
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

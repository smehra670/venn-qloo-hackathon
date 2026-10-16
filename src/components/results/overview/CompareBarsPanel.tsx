import { useMemo } from "react";
import type { ComparePayload, Partner } from "@shared/types";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { tipHide, tipMove, tipShow } from "@/components/results/overview/OverviewTip";
import { pct } from "@/lib/overviewModel";

const NARROW =
  typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false;

type Row = {
  label: string;
  you: number;
  both: number;
  them: number;
};

function rowsFromCompare(payload: ComparePayload): Row[] {
  const tags = payload.tagScores ?? [];
  return tags
    .map((t) => {
      const a = Math.max(0, Math.min(1, t.a));
      const b = Math.max(0, Math.min(1, t.b));
      const both = Math.min(a, b);
      return { label: t.label, you: a - both, both, them: b - both };
    })
    .filter((r) => r.you + r.both + r.them > 0.02)
    .sort((a, b) => b.both - a.both || b.you + b.them - (a.you + a.them))
    .slice(0, 8);
}

export function CompareBarsPanel({
  partner,
  payload,
  loading,
}: {
  partner: Partner | null;
  payload: ComparePayload | null | undefined;
  loading: boolean;
}) {
  const rows = useMemo(() => (payload ? rowsFromCompare(payload) : []), [payload]);

  // Hide when compare failed / empty — never fake bars
  if (!partner) return null;
  if (!loading && (!payload || rows.length === 0)) return null;

  const W = NARROW ? 360 : 460;
  const cx = W / 2;
  const rowH = 36;
  const topPad = 34;
  const maxSide = Math.max(...rows.map((r) => r.you + r.both / 2), ...rows.map((r) => r.them + r.both / 2), 0.2);
  const kx = (W / 2 - 8) / maxSide;

  const youTop = rows.filter((r) => r.you + r.both >= 0.5).length;
  const bothCount = rows.filter((r) => r.both >= 0.5).length;
  const newCount = rows.filter((r) => r.you < 0.15 && r.them + r.both >= 0.55).length;

  const title = loading
    ? `Comparing your crowd with ${partner.name}…`
    : `${partner.name}'s crowd shares ${bothCount} of your ${youTop || rows.length} top tastes${
        newCount ? ` and adds ${newCount} new one${newCount === 1 ? "" : "s"}` : " and adds none that are new"
      }`;
  const subtitle = "Each bar splits the tastes of the two crowds: only yours, both, or only theirs. From Qloo compare.";

  const H = topPad + rows.length * rowH + 8;

  return (
    <ChartCard
      id="c-fly"
      className="ov-fly"
      title={title}
      subtitle={subtitle}
      legend={
        <div className="ov-key">
          <span>
            <i style={{ background: "var(--ov-coral)" }} />
            Only your crowd
          </span>
          <span>
            <i style={{ background: "var(--ov-plum)" }} />
            Both
          </span>
          <span>
            <i style={{ background: "var(--ov-blue)" }} />
            Only {partner.name}'s crowd
          </span>
        </div>
      }
      chart={
        loading ? (
          <p className="ov-note">Loading crowd compare from Qloo…</p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Venn bars: tastes only your crowd has, both share, or only the partner's crowd has"
          >
            <line
              x1={cx}
              x2={cx}
              y1={6}
              y2={H - 4}
              stroke="#C4C9D2"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            {rows.map((r, i) => {
              const y = topPad + i * rowH;
              const by = y + 16;
              const h = 12;
              const xl = cx - (r.you + r.both / 2) * kx;
              const xp0 = cx - (r.both / 2) * kx;
              const xp1 = cx + (r.both / 2) * kx;
              const xr = cx + (r.them + r.both / 2) * kx;
              const a = r.you + r.both;
              const b = r.them + r.both;
              return (
                <g
                  key={r.label}
                  className="ov-fb"
                  tabIndex={0}
                  role="img"
                  aria-label={`${r.label}: ${pct(a)} percent of your crowd, ${pct(b)} percent of ${partner.name}'s crowd`}
                  onMouseEnter={(e) =>
                    tipShow(
                      [
                        { className: "v", text: r.label },
                        { className: "l", text: `${pct(a)}% of your crowd` },
                        { className: "l", text: `${pct(b)}% of ${partner.name}'s crowd` },
                        { className: "l", text: `Both: ${pct(r.both)}%` },
                      ],
                      e.clientX,
                      e.clientY,
                    )
                  }
                  onMouseMove={(e) => tipMove(e.clientX, e.clientY)}
                  onMouseLeave={() => tipHide()}
                  onFocus={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    tipShow(
                      [
                        { className: "v", text: r.label },
                        { className: "l", text: `${pct(a)}% of your crowd` },
                        { className: "l", text: `${pct(b)}% of ${partner.name}'s crowd` },
                        { className: "l", text: `Both: ${pct(r.both)}%` },
                      ],
                      box.left + box.width / 2,
                      box.top,
                    );
                  }}
                  onBlur={() => tipHide()}
                >
                  <text className="ov-fl-t" x={0} y={y + 8}>
                    {r.label}
                  </text>
                  <text className="ov-sk-h" x={W} y={y + 8} textAnchor="end">
                    {pct(r.both)}% in both
                  </text>
                  {xp0 - xl > 1.2 ? (
                    <rect x={xl + 1} y={by} width={Math.max(xp0 - xl - 2, 0.5)} height={h} rx={4} fill="#FF6B57" />
                  ) : null}
                  {xp1 - xp0 > 1.2 ? (
                    <rect x={xp0 + 1} y={by} width={Math.max(xp1 - xp0 - 2, 0.5)} height={h} rx={4} fill="#6B3FA0" />
                  ) : null}
                  {xr - xp1 > 1.2 ? (
                    <rect x={xp1 + 1} y={by} width={Math.max(xr - xp1 - 2, 0.5)} height={h} rx={4} fill="#4F5BFF" />
                  ) : null}
                  <rect x={0} y={y - 6} width={W} height={rowH - 2} fill="transparent" />
                </g>
              );
            })}
          </svg>
        )
      }
      table={
        rows.length > 0 ? (
          <DataTable
            head={["Taste", "Your crowd", "Both", "Their crowd"]}
            rows={rows.map((r) => [
              r.label,
              `${pct(r.you + r.both)}%`,
              `${pct(r.both)}%`,
              `${pct(r.them + r.both)}%`,
            ])}
          />
        ) : undefined
      }
    />
  );
}

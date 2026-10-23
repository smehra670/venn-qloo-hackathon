import { useMemo } from "react";
import type { Partner } from "@shared/types";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { kindLabel, pct, score01 } from "@/lib/overviewModel";
import { cn } from "@/lib/cn";

type Theme = { name: string; weight: number; feeds: Partner[] };

/** Shared taste themes ranked by how much of the overlap they carry (same weighting as the flow chart). */
function rankThemes(partners: Partner[]): { themes: Theme[]; total: number } {
  const map = new Map<string, Theme>();
  for (const p of partners) {
    const tags = p.sharedTags.length > 0 ? p.sharedTags : [];
    if (tags.length === 0) continue;
    const share = score01(p) / tags.length;
    for (const tag of tags) {
      const cur = map.get(tag) ?? { name: tag, weight: 0, feeds: [] };
      cur.weight += share;
      cur.feeds.push(p);
      map.set(tag, cur);
    }
  }
  const themes = [...map.values()].sort((a, b) => b.weight - a.weight);
  return { themes, total: themes.reduce((s, t) => s + t.weight, 0) };
}

export function ThemesPanel({
  partners,
  selectedId,
  hoverId,
  setHover,
}: {
  partners: Partner[];
  selectedId: string | null;
  hoverId: string | null;
  setHover: (id: string | null) => void;
}) {
  const top = partners.slice(0, 6);
  const { themes, total } = useMemo(() => rankThemes(top), [top]);
  if (themes.length === 0) return null;

  const shown = themes.slice(0, 6);
  const max = shown[0]!.weight;
  const focusId = hoverId ?? selectedId;

  return (
    <ChartCard
      id="c-themes"
      className="ov-themes"
      title="What your crowds have in common"
      subtitle="Shared taste themes Qloo found across your top partners, ranked by how much of the overlap each carries."
      legend={
        <div className="ov-key">
          <span>
            <i style={{ background: "var(--ov-plum)" }} />
            Bar length shows share of the match
          </span>
        </div>
      }
      chart={
        <ul className="ov-theme-list">
          {shown.map((t) => {
            const lit = focusId ? t.feeds.some((p) => p.id === focusId) : true;
            return (
              <li key={t.name} className={cn("ov-theme", !lit && "dim")}>
                <div className="ov-theme-head">
                  <span className="nm">{t.name}</span>
                  <b>{Math.round((t.weight / Math.max(total, 0.01)) * 100)}%</b>
                </div>
                <div className="ov-tr">
                  <i style={{ width: `${Math.max(4, (t.weight / max) * 100)}%` }} />
                </div>
                <div className="ov-theme-feeds">
                  {t.feeds.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseEnter={() => setHover(p.id)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(p.id)}
                      onBlur={() => setHover(null)}
                    >
                      {p.name}
                    </button>
                  ))}
                  {t.feeds.length > 3 ? <span>+{t.feeds.length - 3} more</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      }
      table={
        <DataTable
          head={["Theme", "Share of match", "Feeds"]}
          rows={themes.map((t) => [
            t.name,
            `${pct(t.weight / Math.max(total, 0.01))}%`,
            t.feeds.map((p) => `${p.name} (${kindLabel(p.kind)})`).join(", "),
          ])}
        />
      }
    />
  );
}

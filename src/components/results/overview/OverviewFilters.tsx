import type { Partner, PartnerKind } from "@shared/types";
import {
  kindCounts,
  kindLabel,
  type OverviewKindFilter,
} from "@/lib/overviewModel";
import { cn } from "@/lib/cn";

export function OverviewFilters({
  partners,
  kind,
  surprise,
  realistic,
  onKind,
  onSurprise,
  onRealistic,
}: {
  partners: Partner[];
  kind: OverviewKindFilter;
  surprise: number;
  realistic: boolean;
  onKind: (k: OverviewKindFilter) => void;
  onSurprise: (v: number) => void;
  onRealistic: (v: boolean) => void;
}) {
  const counts = kindCounts(partners);
  const w = Math.round(surprise * 100);

  return (
    <section className="ov-filters" aria-label="Filters. They apply to every chart below.">
      <div className="ov-chips" role="group" aria-label="Kinds">
        <button
          type="button"
          className={cn("ov-fc", kind === "all" && "on")}
          aria-pressed={kind === "all"}
          onClick={() => onKind("all")}
        >
          All
          <small>{partners.length}</small>
        </button>
        {counts.map(({ kind: k, count }) => (
          <button
            key={k}
            type="button"
            className={cn("ov-fc", kind === k && "on")}
            aria-pressed={kind === k}
            onClick={() => onKind(k as PartnerKind)}
          >
            {kindLabel(k)}
            <small>{count}</small>
          </button>
        ))}
      </div>
      <span className="ov-vsep" aria-hidden="true" />
      <label className="ov-rng">
        <span className={cn(w < 50 && "on")}>Safe fits</span>
        <input
          type="range"
          min={0}
          max={100}
          value={w}
          aria-label="Safe fits to wildcards"
          onChange={(e) => onSurprise(Number(e.target.value) / 100)}
        />
        <span className={cn(w >= 50 && "on")}>Wildcards</span>
      </label>
      <span className="ov-vsep" aria-hidden="true" />
      <label className="ov-sw">
        <input
          type="checkbox"
          checked={realistic}
          onChange={(e) => onRealistic(e.target.checked)}
        />
        <i aria-hidden="true" />
        Realistic for me
      </label>
    </section>
  );
}

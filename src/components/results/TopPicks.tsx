import { MatchRing } from "@/components/results/MatchRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { useVenn } from "@/store/useVenn";

const TITLES = {
  best_overall: "Best overall",
  best_local: "Best local fit",
  wildcard: "Wildcard",
} as const;

export function TopPicks() {
  const result = useVenn((state) => state.result);
  const select = useVenn((state) => state.select);
  if (!result) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  return (
    <div className="pointer-events-auto flex gap-3 overflow-x-auto md:grid md:grid-cols-3">
      {result.topPicks.map((pick) => {
        const partner = result.partners.find((item) => item.id === pick.partnerId);
        if (!partner) return null;
        return (
          <button
            key={pick.role}
            type="button"
            onClick={() => select(partner.id)}
            className="flex min-w-[220px] items-center gap-3 rounded-[20px] border border-line bg-card/95 p-3 text-left shadow-soft"
          >
            <MatchRing score={partner.matchScore} size={72} />
            <span>
              <span className="block text-xs tracking-wide text-ink-soft">{TITLES[pick.role]}</span>
              <span className="block font-serif text-lg leading-tight">{partner.name}</span>
              <span className="block text-sm text-ink-soft">{pick.headline}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

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

  const wants = result.input.goals?.wants ?? [];
  const usedIds = new Set(result.topPicks.map((pick) => pick.partnerId));
  const goalPick =
    wants.length > 0
      ? [...result.partners]
          .filter((partner) => typeof partner.goalFit === "number")
          .sort((a, b) => (b.goalFit ?? 0) - (a.goalFit ?? 0) || b.matchScore - a.matchScore)[0]
      : undefined;
  const showGoalCard = Boolean(goalPick);

  return (
    <div className={`pointer-events-auto flex gap-3 overflow-x-auto ${showGoalCard ? "md:grid md:grid-cols-4" : "md:grid md:grid-cols-3"}`}>
      {result.topPicks.map((pick) => {
        const partner = result.partners.find((item) => item.id === pick.partnerId);
        if (!partner) return null;
        return (
          <button
            key={pick.role}
            type="button"
            onClick={() => select(partner.id)}
            className="flex min-w-[220px] items-center gap-3 rounded-[12px] border border-line bg-card p-4 text-left"
          >
            <MatchRing score={partner.matchScore} size={72} />
            <span>
              <span className="block text-xs tracking-wide text-ink-soft">{TITLES[pick.role]}</span>
              <span className="block font-bold text-lg leading-tight">{partner.name}</span>
              <span className="block text-sm text-ink-soft">{pick.headline}</span>
            </span>
          </button>
        );
      })}
      {goalPick ? (
        <button
          type="button"
          onClick={() => select(goalPick.id)}
          className="flex min-w-[220px] items-center gap-3 rounded-[12px] border border-line bg-card p-4 text-left"
        >
          <MatchRing score={goalPick.matchScore} size={72} />
          <span>
            <span className="block text-xs tracking-wide text-ink-soft">Best for your goal</span>
            <span className="block font-bold text-lg leading-tight">{goalPick.name}</span>
            <span className="block text-sm text-ink-soft">
              {usedIds.has(goalPick.id) ? "Also a top pick" : "Fits what you're after"}
            </span>
          </span>
        </button>
      ) : null}
    </div>
  );
}

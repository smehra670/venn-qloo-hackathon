import { cn } from "@/lib/cn";
import { KIND_META, kindTint } from "@/lib/kinds";
import { useVenn } from "@/store/useVenn";

const TITLES = {
  best_overall: "Best overall",
  best_local: "Best local fit",
  wildcard: "Wildcard",
} as const;

export function TopPicks() {
  const result = useVenn((state) => state.result);
  const select = useVenn((state) => state.select);
  const selectedId = useVenn((state) => state.selectedId);

  if (!result) return null;

  const wants = result.input.goals?.wants ?? [];
  const usedIds = new Set(result.topPicks.map((pick) => pick.partnerId));
  const goalPick =
    wants.length > 0
      ? [...result.partners]
          .filter((partner) => typeof partner.goalFit === "number")
          .sort((a, b) => (b.goalFit ?? 0) - (a.goalFit ?? 0) || b.matchScore - a.matchScore)[0]
      : undefined;

  const cards: Array<{
    key: string;
    role: string;
    partnerId: string;
    name: string;
    score: number;
    headline: string;
    kind: keyof typeof KIND_META;
  }> = [];

  for (const pick of result.topPicks) {
    const partner = result.partners.find((item) => item.id === pick.partnerId);
    if (!partner) continue;
    cards.push({
      key: pick.role,
      role: TITLES[pick.role],
      partnerId: partner.id,
      name: partner.name,
      score: partner.matchScore,
      headline: pick.headline,
      kind: partner.kind,
    });
  }

  if (goalPick) {
    cards.push({
      key: "goal",
      role: "Best for your goal",
      partnerId: goalPick.id,
      name: goalPick.name,
      score: goalPick.matchScore,
      headline: usedIds.has(goalPick.id) ? "Also a top pick" : "Fits what you're after",
      kind: goalPick.kind,
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-[16px] border border-ink">
      <div
        className={cn(
          "grid divide-y divide-ink sm:divide-x sm:divide-y-0",
          cards.length === 4 ? "sm:grid-cols-4" : cards.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        {cards.map((card) => {
          const active = selectedId === card.partnerId;
          const color = KIND_META[card.kind]?.color ?? "#4f5bff";
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => select(card.partnerId)}
              className="group relative flex min-w-0 flex-col gap-3 overflow-hidden bg-paper p-4 text-left transition hover:bg-ink hover:text-paper"
              style={
                active
                  ? { background: kindTint(card.kind, 0.28), boxShadow: `inset 0 3px 0 ${color}` }
                  : { boxShadow: `inset 0 3px 0 ${color}` }
              }
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft group-hover:text-paper/70">
                  {card.role}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums text-ink group-hover:bg-paper/20 group-hover:text-paper"
                  style={{ background: kindTint(card.kind, 0.4) }}
                >
                  {card.score}
                </span>
              </div>
              <p className="font-mono text-4xl font-extrabold leading-none tabular-nums tracking-tight text-ink group-hover:text-paper">
                {card.score}
              </p>
              <div className="min-w-0">
                <p className="truncate text-base font-bold leading-snug text-ink group-hover:text-paper">{card.name}</p>
                <p className="mt-0.5 truncate text-sm text-ink-soft group-hover:text-paper/65">{card.headline}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { DECISION_ORIGIN_LABELS } from "@shared/constants";
import type { DecisionOrigin } from "@shared/types";
import { useState } from "react";
import { useVenn } from "@/store/useVenn";

function OriginPill({ origin }: { origin?: DecisionOrigin }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
      {DECISION_ORIGIN_LABELS[origin ?? "rule"]}
    </span>
  );
}

/** "How Venn decided": the agent's decision log plus any feasibility tiers worse than "easy"
 * on the current top picks. Hidden entirely when there is nothing to show. */
export function AgentNotes() {
  const result = useVenn((state) => state.result);
  const [open, setOpen] = useState(false);
  if (!result) return null;

  const decisions = result.decisions ?? [];
  const flagged = result.partners.filter(
    (partner) =>
      result.topPicks.some((pick) => pick.partnerId === partner.id) && partner.feasibility && partner.feasibility.level !== "easy",
  );
  if (decisions.length === 0 && flagged.length === 0) return null;

  return (
    <section className="mx-4 mb-2 rounded-2xl border border-line bg-card/70 md:mx-6">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        How Venn decided
        <span className="text-ink-soft">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="space-y-4 px-4 pb-4 text-sm">
          {decisions.length > 0 ? (
            <div>
              <h3 className="text-xs tracking-wide text-ink-soft">Agent decisions</h3>
              <ul className="mt-2 space-y-2">
                {decisions.map((item, index) => (
                  <li key={`${item.step ?? "run"}-${index}`} className="flex flex-wrap items-start gap-2">
                    <OriginPill origin={item.origin} />
                    <span>
                      <span className="font-medium">{item.decision}.</span> <span className="text-ink-soft">{item.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {flagged.length > 0 ? (
            <div>
              <h3 className="text-xs tracking-wide text-ink-soft">Worth checking on your top picks</h3>
              <ul className="mt-2 space-y-2 text-ink-soft">
                {flagged.map((partner) => (
                  <li key={partner.id} className="flex flex-wrap items-start gap-2">
                    <OriginPill origin={partner.feasibility?.origin} />
                    <span>{partner.feasibility?.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

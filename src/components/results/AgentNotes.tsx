import { useState } from "react";
import { useVenn } from "@/store/useVenn";

/** "How Venn decided": the agent's decision log plus any rule-based feasibility notes on
 * the current top picks. Hidden entirely when there is nothing to show. */
export function AgentNotes() {
  const result = useVenn((state) => state.result);
  const [open, setOpen] = useState(false);
  if (!result) return null;

  const decisions = result.decisions ?? [];
  const flagged = result.partners.filter(
    (partner) => result.topPicks.some((pick) => pick.partnerId === partner.id) && partner.feasibility && !partner.feasibility.ok,
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
                  <li key={`${item.step ?? "run"}-${index}`}>
                    <span className="font-medium">{item.decision}.</span> <span className="text-ink-soft">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {flagged.length > 0 ? (
            <div>
              <h3 className="text-xs tracking-wide text-ink-soft">Worth checking on your top picks</h3>
              <ul className="mt-2 space-y-2 text-ink-soft">
                {flagged.flatMap((partner) =>
                  (partner.feasibility?.notes ?? []).map((note, index) => <li key={`${partner.id}-${index}`}>{note}</li>),
                )}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

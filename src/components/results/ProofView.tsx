import { MAX_USER_ADDED_PARTNERS } from "@shared/constants";
import type { ProofKindGroup, ProofResult } from "@shared/types";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { KIND_META } from "@/lib/kinds";
import { useVenn } from "@/store/useVenn";

function SummaryStrip({ summary }: { summary: ProofResult["summary"] }) {
  if (summary.kindsCompared === 0) return null;
  const stats = [
    { label: "Kinds", value: String(summary.kindsCompared) },
    { label: "Venn avg", value: String(summary.avgVennScore) },
    { label: "Baseline avg", value: String(summary.avgBaselineScore) },
    { label: "Avg delta", value: `${summary.avgDelta >= 0 ? "+" : ""}${summary.avgDelta}` },
    { label: "Venn wins", value: String(summary.vennWins) },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-[12px] border border-line bg-paper px-4 py-3">
          <p className="tabular text-3xl font-bold tracking-tight text-ink">{stat.value}</p>
          <p className="mt-1 text-xs text-ink-soft">{stat.label}</p>
        </div>
      ))}
      <p className="col-span-full text-sm text-ink-soft">
        Baseline wins {summary.baselineWins} · ties {summary.ties}
      </p>
    </div>
  );
}

function ItemList({ items, empty }: { items: ProofKindGroup["vennItems"]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.entityId} className="flex items-center justify-between gap-2 rounded-2xl bg-paper-2 px-3 py-2.5">
          <span className="min-w-0 truncate text-sm font-medium">{item.name}</span>
          <span className="font-mono text-xs text-ink-soft">{item.score}</span>
        </li>
      ))}
    </ul>
  );
}

function KindGroupCard({ group }: { group: ProofKindGroup }) {
  const meta = KIND_META[group.kind];
  return (
    <div className="rounded-[12px] border border-line bg-paper/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{meta?.label ?? group.kind}</span>
        {group.poolSize > 0 ? <span className="text-xs text-ink-soft">pool of {group.poolSize}</span> : null}
      </div>
      {group.note ? (
        <p className="mt-2 text-sm text-ink-soft">{group.note}</p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Venn&apos;s pick</p>
            <ItemList items={group.vennItems} empty="No score came back for Venn's pick this time." />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Obvious baseline</p>
            <ItemList items={group.baselineItems} empty="No baseline score came back this time." />
          </div>
        </div>
      )}
    </div>
  );
}

export function ProofView() {
  const result = useVenn((state) => state.result);
  const proof = useVenn((state) => state.proof);
  const proofLoading = useVenn((state) => state.proofLoading);
  const checking = useVenn((state) => state.checking);
  const loadProof = useVenn((state) => state.loadProof);
  const checkPartner = useVenn((state) => state.checkPartner);
  const [name, setName] = useState("");

  useEffect(() => {
    void loadProof();
  }, [loadProof]);

  if (!result) return null;

  const userAddedCount = result.partners.filter((partner) => partner.userAdded).length;
  const atCap = userAddedCount >= MAX_USER_ADDED_PARTNERS;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value || atCap || checking) return;
    await checkPartner(value);
    setName("");
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-auto px-4 py-4 pb-28 md:px-8">
      <section className="card-surface p-5">
        <h2 className="font-bold text-2xl tracking-tight">Check a partner</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Try a brand, artist or place of your own. Venn scores it with this search&apos;s frozen scale and adds it
          as a dashed &ldquo;Your pick&rdquo; node on the graph — up to {MAX_USER_ADDED_PARTNERS} per search.
        </p>
        <form onSubmit={(event) => void onSubmit(event)} className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Patagonia"
            aria-label="Partner name to check"
            disabled={atCap}
            className="min-h-11 min-w-[180px] flex-1 rounded-full border border-line bg-paper-2 px-4 py-2 text-sm outline-none disabled:opacity-50"
          />
          <Button type="submit" disabled={atCap || checking || name.trim().length === 0}>
            {checking ? "Checking…" : "Check"}
          </Button>
        </form>
        {atCap ? (
          <p className="mt-2 text-xs text-ink-soft">
            You&apos;ve checked {MAX_USER_ADDED_PARTNERS} of your own partners in this search.
          </p>
        ) : null}
      </section>

      <section className="card-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-2xl tracking-tight">Proof</h2>
          {proof ? (
            <Chip>{proof.baseline === "ai" ? "AI-suggested baseline" : "Popularity baseline"}</Chip>
          ) : null}
        </div>
        {proofLoading ? <p className="mt-2 text-sm text-ink-soft">Ranking each kind together with a baseline…</p> : null}
        {proof ? (
          <>
            {proof.legacy ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                This search predates Venn&apos;s rank-together Proof, so there&apos;s no discover-call record to replay.
                Run a fresh search to see Venn&apos;s picks ranked together with a baseline, call by call.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{proof.narrative}</p>
                <SummaryStrip summary={proof.summary} />
                {proof.perKind.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {proof.perKind.map((group) => (
                      <KindGroupCard key={group.kind} group={group} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-ink-soft">Not enough partners in this search to compare yet.</p>
                )}
              </>
            )}
            {proof.caveats.length > 0 ? (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
                {proof.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

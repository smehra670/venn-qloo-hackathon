import { MAX_USER_ADDED_PARTNERS } from "@shared/constants";
import type { ProofItem, ProofKindGroup, ProofResult } from "@shared/types";
import { Scale, Search, TrendingUp } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { kindColor, kindLabel } from "@/lib/overviewModel";
import { useVenn } from "@/store/useVenn";

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-bold text-2xl tracking-tight">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper">{icon}</span>
      {children}
    </h2>
  );
}

/** A head-to-head pair of bars for one run average — the headline claim, made visual. */
function HeroBars({ summary }: { summary: ProofResult["summary"] }) {
  const top = Math.max(summary.avgVennScore, summary.avgBaselineScore, 1);
  const ahead = summary.avgDelta >= 0;
  return (
    <div className="rounded-2xl bg-[#F8F8FA] p-5">
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-bold text-ink">Venn&apos;s picks</span>
            <span className="tabular font-bold text-ink">{summary.avgVennScore}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#E3E6EB]">
            <div className="h-full rounded-full bg-blue" style={{ width: `${(summary.avgVennScore / top) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-ink-soft">Obvious baseline</span>
            <span className="tabular font-medium text-ink-soft">{summary.avgBaselineScore}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#E3E6EB]">
            <div className="h-full rounded-full bg-[#C4C9D2]" style={{ width: `${(summary.avgBaselineScore / top) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-sm font-bold">
        <TrendingUp size={15} className={ahead ? "text-blue" : "text-coral"} />
        <span className={ahead ? "text-blue" : "text-coral"}>
          {ahead ? "+" : ""}
          {summary.avgDelta} average points {ahead ? "ahead of" : "behind"} the obvious baseline
        </span>
      </div>
    </div>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line px-4 py-3">
      <p className="tabular text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function ScoreBar({ item, tone }: { item: ProofItem; tone: "venn" | "baseline" }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate" title={item.name}>{item.name}</span>
        <span className="tabular shrink-0 font-mono text-xs text-ink-soft">{item.score}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3E6EB]">
        <div
          className={tone === "venn" ? "h-full rounded-full bg-blue" : "h-full rounded-full bg-[#C4C9D2]"}
          style={{ width: `${Math.max(item.score, 2)}%` }}
        />
      </div>
    </div>
  );
}

function ItemBars({ items, empty, tone }: { items: ProofItem[]; empty: string; tone: "venn" | "baseline" }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <ScoreBar key={item.entityId} item={item} tone={tone} />
      ))}
    </div>
  );
}

function KindCompareCard({ group }: { group: ProofKindGroup }) {
  const topVenn = group.vennItems[0]?.score ?? 0;
  const topBaseline = group.baselineItems[0]?.score ?? 0;
  const verdict =
    group.vennItems.length === 0 || group.baselineItems.length === 0
      ? null
      : topVenn === topBaseline
        ? "Tied"
        : topVenn > topBaseline
          ? "Venn ahead"
          : "Baseline ahead";

  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: kindColor(group.kind) }} />
          {kindLabel(group.kind)}
          {group.poolSize > 0 ? <span className="font-normal text-xs text-ink-soft">pool of {group.poolSize}</span> : null}
        </span>
        {verdict ? (
          <Badge tone={verdict === "Venn ahead" ? "blue" : verdict === "Baseline ahead" ? "neutral" : "sand"}>{verdict}</Badge>
        ) : null}
      </div>
      {group.note ? (
        <p className="mt-2 text-sm text-ink-soft">{group.note}</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">Venn&apos;s pick</p>
            <ItemBars items={group.vennItems} empty="No score came back for Venn's pick this time." tone="venn" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">Obvious baseline</p>
            <ItemBars items={group.baselineItems} empty="No baseline score came back this time." tone="baseline" />
          </div>
        </div>
      )}
    </div>
  );
}

function CheckPartnerCard() {
  const result = useVenn((state) => state.result);
  const checking = useVenn((state) => state.checking);
  const checkPartner = useVenn((state) => state.checkPartner);
  const [name, setName] = useState("");
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
    <section className="rounded-2xl border border-line p-5">
      <SectionHeading icon={<Search size={16} />}>Check a partner</SectionHeading>
      <p className="mt-2 text-sm text-ink-soft">
        Try a brand, artist or place of your own. Venn scores it on this search&apos;s frozen scale and adds it to
        the Overview as a dashed &ldquo;Your pick&rdquo; node — up to {MAX_USER_ADDED_PARTNERS} per search.
      </p>
      <form onSubmit={(event) => void onSubmit(event)} className="mt-3 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Patagonia"
          aria-label="Partner name to check"
          disabled={atCap}
          className="min-h-11 min-w-[180px] flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none disabled:opacity-50"
        />
        <Button type="submit" disabled={atCap || checking || name.trim().length === 0}>
          {checking ? "Checking…" : "Check"}
        </Button>
      </form>
      {atCap ? (
        <p className="mt-2 text-xs text-ink-soft">You&apos;ve checked {MAX_USER_ADDED_PARTNERS} of your own partners in this search.</p>
      ) : null}
    </section>
  );
}

export function ProofView() {
  const result = useVenn((state) => state.result);
  const proof = useVenn((state) => state.proof);
  const proofLoading = useVenn((state) => state.proofLoading);
  const loadProof = useVenn((state) => state.loadProof);

  useEffect(() => {
    void loadProof();
  }, [loadProof]);

  if (!result) return null;

  return (
    <div className="flex w-full flex-col gap-6 py-6 pb-28">
      <section className="rounded-2xl border border-line p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading icon={<Scale size={16} />}>Proof</SectionHeading>
          {proof ? <Badge tone={proof.baseline === "ai" ? "plum" : "neutral"}>{proof.baseline === "ai" ? "Suggested baseline" : "Popularity baseline"}</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Venn&apos;s picks ranked together with an &ldquo;obvious&rdquo; baseline, in the same Qloo call per kind, so the
          comparison is honest.
        </p>

        {proofLoading ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}

        {!proofLoading && proof?.legacy ? (
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            This search predates Venn&apos;s rank-together Proof, so there&apos;s no discover-call record to replay.
            Run a fresh search to see Venn&apos;s picks ranked together with a baseline, call by call.
          </p>
        ) : null}

        {!proofLoading && proof && !proof.legacy ? (
          <>
            <div className="mt-5">
              <HeroBars summary={proof.summary} />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">{proof.narrative}</p>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatPill value={String(proof.summary.kindsCompared)} label="Kinds compared" />
              <StatPill value={String(proof.summary.vennWins)} label="Venn wins" />
              <StatPill value={String(proof.summary.baselineWins)} label="Baseline wins" />
              <StatPill value={String(proof.summary.ties)} label="Ties" />
            </div>

            {proof.perKind.length > 0 ? (
              <div className="mt-5 space-y-3">
                {proof.perKind.map((group) => (
                  <KindCompareCard key={group.kind} group={group} />
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-ink-soft">Not enough partners in this search to compare yet.</p>
            )}

            {proof.caveats.length > 0 ? (
              <ul className="mt-5 space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
                {proof.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <CheckPartnerCard />
    </div>
  );
}

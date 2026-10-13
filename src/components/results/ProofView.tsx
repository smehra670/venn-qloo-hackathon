import { MAX_USER_ADDED_PARTNERS } from "@shared/constants";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useVenn } from "@/store/useVenn";

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
      <section className="rounded-[20px] border border-line bg-card p-4">
        <h2 className="font-serif text-2xl">Check a partner</h2>
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
            className="min-w-[180px] flex-1 rounded-full border border-line bg-paper-2 px-4 py-2 text-sm outline-none disabled:opacity-50"
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

      <section className="rounded-[20px] border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-2xl">Proof</h2>
          {proof ? (
            <Chip>{proof.baseline === "ai" ? "AI-written baseline narrative" : "Popularity baseline"}</Chip>
          ) : null}
        </div>
        {proofLoading ? <p className="mt-2 text-sm text-ink-soft">Comparing against a baseline…</p> : null}
        {proof ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{proof.narrative}</p>
            {proof.rows.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">Not enough partners in this search to compare yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {proof.rows.map((row) => (
                  <li key={row.partnerId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3">
                    <span className="min-w-0 flex-1 truncate font-medium">{row.partnerName}</span>
                    <span className="font-mono text-xs text-ink-soft">Venn {row.matchScore}</span>
                    <span className="font-mono text-xs text-ink-soft">baseline {row.baselineScore}</span>
                    <span className={`font-mono text-xs ${row.delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {row.delta >= 0 ? "+" : ""}
                      {row.delta}
                    </span>
                    <span className="basis-full text-sm text-ink-soft">{row.explanation}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

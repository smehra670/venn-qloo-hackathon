import type { RunResult } from "@shared/types";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { MatchRing } from "@/components/results/MatchRing";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, getShare } from "@/lib/api";
import { businessLabel } from "@/lib/format";
import { KIND_META } from "@/lib/kinds";

/**
 * Minimal, fully read-only viewer for a `/api/share/:token` link: no selection, pinning,
 * briefs, or any other mutation — it never touches the main `useVenn` store, just its own
 * local state for the fetched result. "Keep it simple": a top-picks strip plus a plain
 * shortlist is enough to show what was shared, see 6.4 in the plan.
 */
export function ShareView({ token }: { token: string }) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getShare(token)
      .then((response) => {
        if (!cancelled) setResult(response.result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "This share link could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const goHome = () => {
    window.location.hash = "";
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center gap-3">
        <Logo />
        <Badge>Shared · read-only</Badge>
        <Button type="button" variant="ghost" className="ml-auto" onClick={goHome}>
          Open Venn
        </Button>
      </header>

      {loading ? (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : null}

      {!loading && error ? (
        <EmptyState
          className="mt-10"
          title="That share link wandered off"
          body={`${error} Share links stay live for 7 days after they are created.`}
          action={
            <Button type="button" onClick={goHome}>
              Start your own search
            </Button>
          }
        />
      ) : null}

      {!loading && result ? (
        <>
          <h1 className="font-bold text-2xl tracking-tight md:text-3xl">{result.headline}</h1>
          <p className="text-sm text-ink-soft">
            {businessLabel(result.input)} · {result.input.city} · shared from a Venn search
          </p>

          {result.topPicks.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {result.topPicks.map((pick) => {
                const partner = result.partners.find((item) => item.id === pick.partnerId);
                if (!partner) return null;
                return (
                  <div key={pick.role} className="flex min-w-[220px] items-center gap-3 rounded-[12px] border border-line bg-card p-4 shadow-soft">
                    <MatchRing score={partner.matchScore} size={64} />
                    <span>
                      <span className="block text-xs tracking-wide text-ink-soft">{pick.headline}</span>
                      <span className="block font-bold text-lg leading-tight">{partner.name}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-card shadow-soft">
            {[...result.partners]
              .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name))
              .map((partner, index) => (
                <li key={partner.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <span className="w-6 font-mono text-xs text-ink-soft">{index + 1}</span>
                  <MatchRing score={partner.matchScore} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{partner.name}</span>
                    <span className="mt-1 flex flex-wrap gap-2">
                      <Chip>{KIND_META[partner.kind].label}</Chip>
                      <Chip>{partner.local ? "Local" : "Brand"}</Chip>
                    </span>
                    <span className="mt-1 block text-sm text-ink-soft">{partner.reasons[0] ?? partner.blurb}</span>
                  </span>
                </li>
              ))}
          </ul>

          {result.limits.length > 0 ? (
            <div className="space-y-1 pb-6">
              {result.limits.map((limit) => (
                <p key={limit} className="text-xs leading-relaxed text-ink-soft">{limit}</p>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

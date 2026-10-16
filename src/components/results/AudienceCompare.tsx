import type { ComparePayload } from "@shared/types";
import { Chip } from "@/components/ui/Chip";
import { Skeleton } from "@/components/ui/Skeleton";
import { clamp } from "@/lib/format";

function SignalBar({ label, value, median }: { label: string; value: number; median: number }) {
  const valuePct = Math.round(clamp(value, 0, 1) * 100);
  const medianPct = Math.round(clamp(median, 0, 1) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>{label}</span>
        <span className="font-mono">{valuePct}% vs {medianPct}% median</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-[#eef0f4]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${valuePct}%` }} />
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-ink/40"
          style={{ left: `${medianPct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function sourceLabel(source: ComparePayload["source"]): string {
  return source === "qloo_tags" ? "Source: Qloo tag analysis" : "Source: computed from shared tags";
}

export function AudienceCompare({ payload, loading }: { payload?: ComparePayload; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-3 space-y-2 rounded-[16px] border border-line bg-paper p-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }
  if (!payload) return null;

  return (
    <div className="mt-3 rounded-[16px] border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Your audience vs {payload.partnerName}</h4>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft">{sourceLabel(payload.source)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {payload.sharedTags.length === 0 ? (
          <p className="text-xs text-ink-soft">No strong shared tags to compare.</p>
        ) : (
          payload.sharedTags.map((tag) => <Chip key={tag}>{tag}</Chip>)
        )}
      </div>
      <div className="mt-3 space-y-2.5">
        {payload.signals.map((signal) => (
          <SignalBar key={signal.label} label={signal.label} value={signal.value} median={signal.median} />
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        {payload.popularityDelta >= 0 ? "More" : "Less"} locally popular than the median partner in this search by{" "}
        {Math.abs(Math.round(payload.popularityDelta * 100))} points.
      </p>
      <p className="mt-2 text-[11px] text-ink-soft">{payload.note}</p>
      <p className="mt-1 text-[11px] text-ink-soft">
        Compare uses matched brand and place anchors only. Topic tags shape discover ranking, not this chart.
      </p>
    </div>
  );
}

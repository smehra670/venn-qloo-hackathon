import type { ComparePayload } from "@shared/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { clamp } from "@/lib/format";

function SignalBar({ label, value, median }: { label: string; value: number; median: number }) {
  const valuePct = Math.round(clamp(value, 0, 1) * 100);
  const medianPct = Math.round(clamp(median, 0, 1) * 100);
  return (
    <div className="dw-sig">
      <div className="dw-sig-head">
        <span>{label}</span>
        <b>
          {valuePct}
          <small> · median {medianPct}</small>
        </b>
      </div>
      <div className="dw-sig-track">
        <i style={{ width: `${valuePct}%` }} />
        <em style={{ left: `${medianPct}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}

/** "Your crowd vs theirs" inside the partner drawer: per-taste scores for both crowds when Qloo
 * could score the partner's crowd, plus this partner's signals against the search's median. */
export function AudienceCompare({ payload, loading }: { payload?: ComparePayload; loading: boolean }) {
  if (loading) {
    return (
      <section className="dw-sec dw-compare">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-full" />
      </section>
    );
  }
  if (!payload) return null;
  const tastes = payload.tagScores ?? [];

  return (
    <section className="dw-sec dw-compare">
      <h3>Your crowd vs theirs</h3>
      {tastes.length > 0 ? (
        <div className="dw-tastes">
          {tastes.slice(0, 6).map((taste) => (
            <div key={taste.label} className="dw-taste">
              <span>{taste.label}</span>
              <div className="dw-taste-bars" aria-label={`Your crowd ${Math.round(taste.a * 100)}, theirs ${Math.round(taste.b * 100)}`}>
                <i className="you" style={{ width: `${Math.round(clamp(taste.a, 0, 1) * 100)}%` }} />
                <i className="them" style={{ width: `${Math.round(clamp(taste.b, 0, 1) * 100)}%` }} />
              </div>
            </div>
          ))}
          <p className="dw-key">
            <span>
              <i className="you" /> Your crowd
            </span>
            <span>
              <i className="them" /> {payload.partnerName}'s crowd
            </span>
          </p>
        </div>
      ) : payload.sharedTags.length > 0 ? (
        <div>
          {payload.sharedTags.map((tag) => (
            <span key={tag} className="ov-why-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="ov-why-note">Qloo couldn't score this partner's crowd on your top tastes.</p>
      )}
      <div className="dw-sigs">
        {payload.signals.map((signal) => (
          <SignalBar key={signal.label} label={signal.label} value={signal.value} median={signal.median} />
        ))}
      </div>
      <p className="ov-why-note">{payload.note}</p>
    </section>
  );
}

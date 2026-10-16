import { useEffect, useState } from "react";
import type { Partner } from "@shared/types";
import { useReveal } from "@/components/results/overview/useReveal";
import {
  distFor,
  firstMessageIdea,
  kindLabel,
  overlapFraction,
  pct,
  REACH_LABEL,
  reachLevel,
  topThemes,
  prefersStaticMotion,
} from "@/lib/overviewModel";

function MiniVenn({ fraction }: { fraction: number }) {
  const R = 19;
  const d = distFor(fraction, R, R);
  const W = 4 * R + 10;
  const H = 2 * R + 8;
  const cy = H / 2;
  const uid = "sel-clip";
  return (
    <svg className="ov-glyph" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <clipPath id={uid}>
          <circle cx={R + 5} cy={cy} r={R} />
        </clipPath>
      </defs>
      <circle cx={R + 5} cy={cy} r={R} fill="#FF6B57" />
      <circle cx={R + 5 + d} cy={cy} r={R} fill="#4F5BFF" />
      <circle cx={R + 5 + d} cy={cy} r={R} fill="#6B3FA0" clipPath={`url(#${uid})`} />
    </svg>
  );
}

export function SelectedCard({
  partner,
  youLabel,
  pinned,
  onDraft,
  onTogglePin,
}: {
  partner: Partner | null;
  youLabel: string;
  pinned: boolean;
  onDraft: () => void;
  onTogglePin: () => void;
}) {
  const [swap, setSwap] = useState(false);
  const revealRef = useReveal<HTMLElement>();
  useEffect(() => {
    if (!partner || prefersStaticMotion()) return;
    setSwap(false);
    const id = requestAnimationFrame(() => setSwap(true));
    return () => cancelAnimationFrame(id);
  }, [partner?.id]);

  if (!partner) return null;
  const themes = topThemes(partner, 3);
  const dist = partner.venueFacts?.distanceM;
  const lvl = reachLevel(partner);

  return (
    <article ref={revealRef} className="ov-card ov-selcard reveal" id="c-sel">
      <div className={swap ? "swap" : undefined} id="selBody">
        <div className="ov-sel-top">
          <MiniVenn fraction={overlapFraction(partner)} />
          <div>
            <h3>{partner.name}</h3>
            <div className="ov-sel-meta">
              <span>{kindLabel(partner.kind)}</span>
              <span>
                {typeof dist === "number"
                  ? `${(dist / 1000).toFixed(1)} km away`
                  : partner.local
                    ? "Local place"
                    : "No fixed location"}
              </span>
              <span className={`ov-lvl ${lvl}`}>{REACH_LABEL[lvl]}</span>
            </div>
          </div>
        </div>
        {themes.length > 0 ? (
          <>
            <div className="ov-why">Why they match</div>
            {themes.map((t) => (
              <div key={t.name} className="ov-cbar">
                <span>{t.name}</span>
                <div className="ov-tr">
                  <i style={{ width: `${pct(t.weight)}%` }} />
                </div>
                <b>{pct(t.weight)}%</b>
              </div>
            ))}
          </>
        ) : null}
        <div className="ov-first">
          <span>Venn’s idea for a first message</span>
          {firstMessageIdea(partner, youLabel)}
        </div>
        <div className="ov-acts">
          <button type="button" className="ov-btn ov-btn-sm" onClick={onDraft}>
            Draft outreach
          </button>
          <button type="button" className="ov-btn ov-btn-sm ov-btn-ghost" onClick={onTogglePin}>
            {pinned ? "Added to shortlist" : "Add to shortlist"}
          </button>
        </div>
      </div>
    </article>
  );
}

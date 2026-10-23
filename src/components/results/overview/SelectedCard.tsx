import { useEffect, useState } from "react";
import type { Partner } from "@shared/types";
import { useTasteFocus } from "@/components/results/overview/tasteFocus";
import { useReveal } from "@/components/results/overview/useReveal";
import { cn } from "@/lib/cn";
import { tasteId } from "@/lib/tastes";
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
  const R = 17;
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
  const focusedId = useTasteFocus().taste?.id ?? null;
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
      <div className={swap ? "swap ov-sel-grid" : "ov-sel-grid"} id="selBody">
        <div className="ov-sel-col ov-sel-id-col">
        <div className="ov-sel-top">
          <MiniVenn fraction={overlapFraction(partner)} />
          <div className="ov-sel-id">
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
          <div className="ov-sel-score" aria-label={`${Math.round(partner.matchScore)} overlap`}>
            {Math.round(partner.matchScore)}
            <small>overlap</small>
          </div>
        </div>
        </div>
        <div className="ov-sel-col">
        <div className="ov-why">Why they match</div>
        {themes.length > 0 ? (
          themes.map((t) =>
            t.you !== undefined ? (
              <div
                key={t.name}
                className={cn("ov-cbar", focusedId === tasteId(t.name) && "ov-tmf")}
                title={`Your crowd's Qloo affinity for ${t.name}: ${pct(t.you)} of 100`}
              >
                <span>{t.name}</span>
                <div className="ov-tr">
                  <i style={{ width: `${pct(t.you)}%` }} />
                </div>
                <b>{pct(t.you)}</b>
              </div>
            ) : (
              <span key={t.name} className={cn("ov-why-chip", focusedId === tasteId(t.name) && "ov-tmf")}>
                {t.name}
              </span>
            ),
          )
        ) : (
          <p className="ov-why-note">No taste both crowds rate highly was reported for this partner.</p>
        )}
        {partner.drivers && partner.drivers.length > 0 ? (
          <p className="ov-drivers">
            Driven by{" "}
            {partner.drivers.slice(0, 3).map((driver, index) => (
              <span key={driver.anchor}>
                {index > 0 ? ", " : ""}
                <b>{driver.anchor}</b> {pct(driver.share)}%
              </span>
            ))}
            <small> · Qloo explainability</small>
          </p>
        ) : null}
        {themes.some((t) => t.you !== undefined) ? (
          <p className="ov-why-note">Your crowd's top tastes that Qloo also tags {partner.name} with; bars show how strongly your crowd rates each (out of 100).</p>
        ) : null}
        </div>
        <div className="ov-sel-col">
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
      </div>
    </article>
  );
}

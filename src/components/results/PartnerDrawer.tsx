import { DECISION_ORIGIN_LABELS, FEASIBILITY_LABELS, MAX_PARTNERS } from "@shared/constants";
import { ExternalLink, MapPin, Pin, PinOff, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { AudienceCompare } from "@/components/results/AudienceCompare";
import { EvidencePanel } from "@/components/results/EvidencePanel";
import { cn } from "@/lib/cn";
import { goalFitLabel } from "@/lib/goals";
import { kindColor, kindLabel } from "@/lib/overviewModel";
import { useVenn } from "@/store/useVenn";

const LEVEL_CLASS = { easy: "easy", warm_intro: "warm", long_shot: "long" } as const;

/** Partner detail panel for the Shortlist tab (dashboard styling, `ov-*` / `dw-*`). */
export function PartnerDrawer() {
  const result = useVenn((state) => state.result);
  const selectedId = useVenn((state) => state.selectedId);
  const select = useVenn((state) => state.select);
  const pinned = useVenn((state) => state.pinnedIds);
  const togglePin = useVenn((state) => state.togglePin);
  const openBrief = useVenn((state) => state.openBrief);
  const expandPartner = useVenn((state) => state.expandPartner);
  const loadCompare = useVenn((state) => state.loadCompare);
  const closeCompare = useVenn((state) => state.closeCompare);
  const compareOpenId = useVenn((state) => state.compareOpenId);
  const compareLoading = useVenn((state) => state.compareLoading);
  const compare = useVenn((state) => state.compare);
  const ref = useRef<HTMLElement>(null);
  const partner = result?.partners.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!partner) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    const focusable = dialog?.querySelector<HTMLElement>("button, [href], input, select, textarea");
    focusable?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        select(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [partner, select]);

  if (!result || !partner) return null;
  const atCap = result.partners.length >= MAX_PARTNERS;
  const goalChip = goalFitLabel(partner, result.input.goals);
  const color = kindColor(partner.kind);
  const isPinned = pinned.has(partner.id);
  const dist = partner.venueFacts?.distanceM;
  const where =
    typeof dist === "number"
      ? `${(dist / 1000).toFixed(1)} km away`
      : partner.local
        ? partner.locationLabel
          ? `Local · ${partner.locationLabel}`
          : "Local place"
        : "Brand · no fixed location";
  const level = partner.feasibility?.level;
  const compareOpen = compareOpenId === partner.id;

  return (
    <>
      <button type="button" className="dw-scrim" aria-label="Close partner details" onClick={() => select(null)} />
      <aside ref={ref} role="dialog" aria-modal="true" aria-labelledby="partner-title" className="dw">
        <div className="dw-body">
          <div className="dw-head">
            <div className="dw-id">
              <p className="dw-eyebrow">
                <i style={{ background: color }} aria-hidden="true" />
                {kindLabel(partner.kind)}
              </p>
              <h2 id="partner-title">{partner.name}</h2>
              <p className="dw-where">{where}</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => select(null)} className="dw-close">
              <X size={16} />
            </button>
          </div>

          <div className="dw-score">
            <div className="dw-score-n">
              {Math.round(partner.matchScore)}
              <small>/100</small>
            </div>
            <div className="dw-score-cap">
              <b>Match</b>
              {result.normalization?.absolute ? "Mutual Qloo affinity: your crowd and theirs" : "Relative to this search"}
            </div>
          </div>

          <div className="dw-pills">
            {level ? (
              <span className={cn("ov-lvl", LEVEL_CLASS[level])}>
                {partner.feasibility?.origin === "ai" ? `${FEASIBILITY_LABELS[level]} · ${DECISION_ORIGIN_LABELS.ai}` : FEASIBILITY_LABELS[level]}
              </span>
            ) : null}
            {partner.userAdded ? <span className="sl-tag">Your pick</span> : null}
            {goalChip ? <span className="sl-tag">{goalChip}</span> : null}
            {isPinned ? <span className="sl-tag on">On your shortlist</span> : null}
          </div>

          <p className="dw-blurb">{partner.blurb}</p>
          {partner.feasibility ? <p className="ov-first dw-note">{partner.feasibility.reason}</p> : null}

          <section className="dw-sec">
            <h3>Why this fits</h3>
            <ul className="dw-reasons">
              {partner.reasons.map((reason) => (
                <li key={reason}>
                  <i style={{ background: color }} aria-hidden="true" />
                  {reason}
                </li>
              ))}
            </ul>
          </section>

          <section className="dw-sec">
            <h3>Shared tastes</h3>
            {partner.sharedTags.length === 0 ? (
              <p className="ov-why-note">No taste both crowds rate highly was reported for this partner.</p>
            ) : (
              <div>
                {partner.sharedTags.map((tag) => (
                  <span key={tag} className="ov-why-chip">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {partner.drivers && partner.drivers.length > 0 ? (
              <p className="ov-drivers">
                Driven by{" "}
                {partner.drivers.slice(0, 3).map((driver, index) => (
                  <span key={driver.anchor}>
                    {index > 0 ? ", " : ""}
                    <b>{driver.anchor}</b> {Math.round(driver.share * 100)}%
                  </span>
                ))}
                <small> · Qloo explainability</small>
              </p>
            ) : null}
          </section>

          {partner.venueFacts ? (
            <section className="dw-sec dw-venue">
              <h3>Venue</h3>
              {partner.venueFacts.address ? (
                <p>
                  <MapPin size={14} aria-hidden="true" />
                  <span>{partner.venueFacts.address}</span>
                </p>
              ) : null}
              {partner.venueFacts.website ? (
                <a href={partner.venueFacts.website} target="_blank" rel="noreferrer">
                  Website
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null}
            </section>
          ) : null}

          {compareOpen ? <AudienceCompare payload={compare[partner.id]} loading={compareLoading && !compare[partner.id]} /> : null}

          <EvidencePanel items={partner.evidence} provider={result.provider} limits={result.limits} />

          {partner.relatedIds.length > 0 ? (
            <section className="dw-sec">
              <h3>Also pairs well with</h3>
              <div className="dw-related">
                {partner.relatedIds.map((id) => {
                  const related = result.partners.find((item) => item.id === id);
                  if (!related) return null;
                  return (
                    <button key={id} type="button" onClick={() => select(id)}>
                      <i style={{ background: kindColor(related.kind) }} aria-hidden="true" />
                      {related.name}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <div className="dw-acts">
          <button type="button" className="ov-btn" onClick={() => void openBrief(partner.id)}>
            Create partner brief
          </button>
          <div className="dw-acts-row">
            <button type="button" className={cn("ov-btn ov-btn-ghost", isPinned && "dw-on")} onClick={() => togglePin(partner.id)}>
              {isPinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
              {isPinned ? "Unpin" : "Add to shortlist"}
            </button>
            <button
              type="button"
              className="ov-btn ov-btn-ghost"
              onClick={() => {
                if (compareOpen) closeCompare();
                else void loadCompare(partner.id);
              }}
            >
              {compareOpen ? "Hide compare" : "Compare crowds"}
            </button>
          </div>
          <button type="button" className="ov-link dw-expand" disabled={atCap} onClick={() => void expandPartner(partner.id)}>
            Find more like this
          </button>
          {atCap ? <p className="ov-why-note">This search already has {MAX_PARTNERS} partners (the limit).</p> : null}
        </div>
      </aside>
    </>
  );
}

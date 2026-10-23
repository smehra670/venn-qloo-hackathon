import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import { Info, RotateCcw, Share2 } from "lucide-react";
import { useVenn, type ResultsView } from "@/store/useVenn";
import { cn } from "@/lib/cn";

const VIEWS: { value: ResultsView; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "shortlist", label: "Shortlist" },
];

/** The sticky results bar shared by Overview and Shortlist (dashboard styling, `ov-*`). */
export function ResultsHeader() {
  const result = useVenn((s) => s.result);
  const view = useVenn((s) => s.view);
  const setView = useVenn((s) => s.setView);
  const reset = useVenn((s) => s.reset);
  const shareRun = useVenn((s) => s.shareRun);
  const sharing = useVenn((s) => s.sharing);
  const openCallLog = useVenn((s) => s.openCallLog);
  const pinnedCount = useVenn((s) => s.pinnedIds.size);
  if (!result) return null;

  const anchors = (result.input.tasteAnchors ?? []).map((a) => a.name);
  const businessTypeLabel =
    result.input.businessType === "other" && result.input.businessTypeCustom
      ? result.input.businessTypeCustom
      : BUSINESS_TYPE_LABELS[result.input.businessType];
  const queryBits = [
    businessTypeLabel,
    result.input.city,
    (anchors.length ? anchors : result.input.anchors).slice(0, 2).join(", "),
  ].filter(Boolean);

  return (
    <header className="ov-bar">
      <div className="ov-bar-in">
        <a className="ov-brand" href="#/" aria-label="Venn home">
          <svg width="38" height="26" viewBox="0 0 40 28" aria-hidden="true">
            <defs>
              <clipPath id="ov-mk-shared">
                <circle cx="14" cy="14" r="13" />
              </clipPath>
            </defs>
            <circle cx="14" cy="14" r="13" fill="#FF6B57" />
            <circle cx="26" cy="14" r="13" fill="#4F5BFF" />
            <circle cx="26" cy="14" r="13" fill="#6B3FA0" clipPath="url(#ov-mk-shared)" />
          </svg>
          <span className="ov-brand-label">Venn</span>
        </a>
        <div className="ov-q" aria-label="Your search">
          {queryBits.map((bit, i) => (
            <span key={`${bit}-${i}`}>
              {i > 0 ? <i /> : null}
              {bit}
            </span>
          ))}
        </div>
        <nav className="ov-tabs" aria-label="Views">
          {VIEWS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(view === item.value && "on")}
              aria-current={view === item.value ? "page" : undefined}
              onClick={() => setView(item.value)}
            >
              {item.label}
              {item.value === "shortlist" && pinnedCount > 0 ? <small className="ov-tab-count">{pinnedCount}</small> : null}
            </button>
          ))}
        </nav>
        <div className="ov-bar-r">
          <button type="button" className="ov-link" aria-label="How Venn used Qloo" onClick={() => void openCallLog()}>
            <Info size={16} aria-hidden="true" />
            <span className="ov-link-label">How Venn used Qloo</span>
          </button>
          <button
            type="button"
            className="ov-link"
            aria-label={sharing ? "Copying…" : "Share"}
            disabled={sharing}
            onClick={() => void shareRun()}
          >
            <Share2 size={16} aria-hidden="true" />
            <span className="ov-link-label">{sharing ? "Copying…" : "Share"}</span>
          </button>
          <button type="button" className="ov-btn" aria-label="New search" onClick={reset}>
            <RotateCcw size={16} aria-hidden="true" />
            <span className="ov-btn-label">New search</span>
          </button>
        </div>
      </div>
    </header>
  );
}

import { FEASIBILITY_LABELS } from "@shared/constants";
import type { Partner, PartnerKind } from "@shared/types";
import { Pin, PinOff } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { downloadText, partnersToCsv } from "@/lib/format";
import { kindColor, kindCounts, kindLabel } from "@/lib/overviewModel";
import { useVenn } from "@/store/useVenn";

type SortKey = "score" | "surprise" | "goal" | "name";
type KindFilter = PartnerKind | "all";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Match" },
  { value: "surprise", label: "Surprise" },
  { value: "goal", label: "Goal fit" },
  { value: "name", label: "Name" },
];

const LEVEL_CLASS = { easy: "easy", warm_intro: "warm", long_shot: "long" } as const;

/** Shortlist tab: pin the partners worth contacting (dashboard styling, `ov-*` / `sl-*`). */
export function ShortlistView() {
  const result = useVenn((state) => state.result);
  const pinned = useVenn((state) => state.pinnedIds);
  const togglePin = useVenn((state) => state.togglePin);
  const select = useVenn((state) => state.select);
  const selectedId = useVenn((state) => state.selectedId);
  const openBrief = useVenn((state) => state.openBrief);
  const [sort, setSort] = useState<SortKey>("score");
  const [kind, setKind] = useState<KindFilter>("all");

  const partners = result?.partners ?? [];
  const hasGoalFit = partners.some((partner) => typeof partner.goalFit === "number");
  const ordered = useMemo(() => {
    const list = partners.filter((partner) => kind === "all" || partner.kind === kind);
    list.sort((a, b) => compare(a, b, sort));
    return {
      pinnedRows: list.filter((partner) => pinned.has(partner.id)),
      rest: list.filter((partner) => !pinned.has(partner.id)),
    };
  }, [partners, pinned, sort, kind]);

  if (!result) return null;

  const pinnedAll = partners.filter((partner) => pinned.has(partner.id));
  const best = [...partners].sort((a, b) => b.matchScore - a.matchScore)[0];
  const local = partners.filter((partner) => partner.local).length;
  const download = () => downloadText("venn-shortlist.csv", partnersToCsv([...ordered.pinnedRows, ...ordered.rest]), "text/csv");
  const rowProps = {
    pinned,
    selectedId,
    onPin: togglePin,
    onOpen: (id: string) => select(id),
    onBrief: (id: string) => void openBrief(id),
  };

  return (
    <div className="sl-page">
      <section className="ov-hero" aria-labelledby="sl-h1">
        <div className="ov-hero-copy">
          <h1 id="sl-h1">
            {pinnedAll.length > 0
              ? `${pinnedAll.length} partner${pinnedAll.length === 1 ? "" : "s"} on your shortlist`
              : "Build your shortlist"}
          </h1>
          <p className="ov-lede">
            Pin the partners worth contacting. Your shortlist feeds partner briefs and the CSV export. Click any row
            for the full evidence.
          </p>
        </div>
        <dl className="ov-stats-strip" aria-label="Summary">
          <Stat value={String(pinnedAll.length)} label="Pinned" hint={`of ${partners.length}`} />
          <Stat value={best ? String(Math.round(best.matchScore)) : "—"} label="Best match" hint={best?.name} />
          <Stat value={String(local)} label="Local places" hint={`${partners.length - local} brands`} />
          <Stat value={String(kindCounts(partners).length)} label="Kinds" hint="of partner" />
        </dl>
      </section>

      <section className="ov-filters" aria-label="Filter and sort">
        <div className="ov-chips" role="group" aria-label="Kinds">
          <button type="button" className={cn("ov-fc", kind === "all" && "on")} aria-pressed={kind === "all"} onClick={() => setKind("all")}>
            All
            <small>{partners.length}</small>
          </button>
          {kindCounts(partners).map(({ kind: k, count }) => (
            <button key={k} type="button" className={cn("ov-fc", kind === k && "on")} aria-pressed={kind === k} onClick={() => setKind(k)}>
              <i className="ov-fc-dot" style={{ background: kindColor(k) }} aria-hidden="true" />
              {kindLabel(k)}
              <small>{count}</small>
            </button>
          ))}
        </div>
        <span className="ov-vsep" aria-hidden="true" />
        <div className="sl-sort" role="group" aria-label="Sort by">
          <span>Sort</span>
          <div className="ov-vt">
            {SORTS.filter((item) => item.value !== "goal" || hasGoalFit).map((item) => (
              <button key={item.value} type="button" className={sort === item.value ? "on" : undefined} onClick={() => setSort(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sl-tools">
          <button type="button" className="ov-btn ov-btn-sm ov-btn-ghost" onClick={download}>
            Download CSV
          </button>
        </div>
      </section>

      <article className="ov-card sl-card">
        <header className="ov-ch">
          <div>
            <h2>Your shortlist</h2>
            <p className="ov-sub">
              {ordered.pinnedRows.length > 0
                ? "The partners you've pinned, in the order you've chosen to sort them."
                : "Nothing pinned yet. Use the pin on any partner below, or “Add to shortlist” on the Overview."}
            </p>
          </div>
        </header>
        {ordered.pinnedRows.length > 0 ? (
          <ul className="sl-list">
            {ordered.pinnedRows.map((partner, index) => (
              <Row key={partner.id} partner={partner} rank={index + 1} {...rowProps} />
            ))}
          </ul>
        ) : (
          <div className="sl-empty">
            <span aria-hidden="true">
              <Pin size={18} />
            </span>
            Pinned partners appear here.
          </div>
        )}
      </article>

      <article className="ov-card sl-card">
        <header className="ov-ch">
          <div>
            <h2>All partners</h2>
            <p className="ov-sub">
              {ordered.rest.length} partner{ordered.rest.length === 1 ? "" : "s"}
              {kind === "all" ? "" : ` in ${kindLabel(kind)}`}. Scores are mutual Qloo affinity out of 100.
            </p>
          </div>
        </header>
        {ordered.rest.length > 0 ? (
          <ul className="sl-list">
            {ordered.rest.map((partner, index) => (
              <Row key={partner.id} partner={partner} rank={ordered.pinnedRows.length + index + 1} {...rowProps} />
            ))}
          </ul>
        ) : (
          <div className="sl-empty">Every partner in this filter is on your shortlist.</div>
        )}
      </article>
    </div>
  );
}

function compare(a: Partner, b: Partner, sort: SortKey): number {
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "surprise") return b.surprise - a.surprise || b.matchScore - a.matchScore;
  if (sort === "goal") return (b.goalFit ?? 0) - (a.goalFit ?? 0) || b.matchScore - a.matchScore;
  return b.matchScore - a.matchScore || a.name.localeCompare(b.name);
}

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="ov-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

function where(partner: Partner): string {
  const dist = partner.venueFacts?.distanceM;
  if (typeof dist === "number") return `${(dist / 1000).toFixed(1)} km away`;
  if (partner.local) return partner.locationLabel ? `Local · ${partner.locationLabel}` : "Local place";
  return "Brand · no fixed location";
}

function Row({
  partner,
  rank,
  pinned,
  selectedId,
  onPin,
  onOpen,
  onBrief,
}: {
  partner: Partner;
  rank: number;
  pinned: Set<string>;
  selectedId: string | null;
  onPin: (id: string) => void;
  onOpen: (id: string) => void;
  onBrief: (id: string) => void;
}) {
  const isPinned = pinned.has(partner.id);
  const level = partner.feasibility?.level;
  return (
    <li className={cn("sl-row", selectedId === partner.id && "sel", isPinned && "pinned")}>
      <span className="sl-rank">{rank}</span>
      <button type="button" className="sl-main" onClick={() => onOpen(partner.id)} aria-label={`Open ${partner.name}`}>
        <span className="sl-name">
          <i style={{ background: kindColor(partner.kind) }} aria-hidden="true" />
          {partner.name}
        </span>
        <span className="sl-meta">
          <span>{kindLabel(partner.kind)}</span>
          <span>{where(partner)}</span>
          {level ? <span className={cn("ov-lvl", LEVEL_CLASS[level])}>{FEASIBILITY_LABELS[level]}</span> : null}
          {partner.userAdded ? <span className="sl-tag">Your pick</span> : null}
        </span>
        <span className="sl-why">{partner.reasons[0] ?? partner.blurb}</span>
        {partner.sharedTags.length > 0 ? (
          <span className="sl-tastes">
            {partner.sharedTags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </span>
        ) : null}
      </button>
      <span className="sl-score" aria-label={`${Math.round(partner.matchScore)} match`}>
        {Math.round(partner.matchScore)}
        <small>match</small>
      </span>
      <span className="sl-acts">
        <button
          type="button"
          className={cn("sl-pin", isPinned && "on")}
          aria-pressed={isPinned}
          onClick={() => onPin(partner.id)}
          title={isPinned ? "Remove from shortlist" : "Add to shortlist"}
        >
          {isPinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
          {isPinned ? "Unpin" : "Pin"}
        </button>
        <button type="button" className="ov-btn ov-btn-sm ov-btn-ghost" onClick={() => onBrief(partner.id)}>
          Brief
        </button>
      </span>
    </li>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ResultsHeader } from "@/components/results/ResultsHeader";
import { OverviewFilters } from "@/components/results/overview/OverviewFilters";
import { OrbitPanel } from "@/components/results/overview/OrbitPanel";
import { PicksPanel } from "@/components/results/overview/PicksPanel";
import { SelectedCard } from "@/components/results/overview/SelectedCard";
import { ScatterPanel } from "@/components/results/overview/ScatterPanel";
import { OverviewMapPanel } from "@/components/results/overview/OverviewMapPanel";
import { SankeyPanel } from "@/components/results/overview/SankeyPanel";
import { CompareBarsPanel, compareHasRows } from "@/components/results/overview/CompareBarsPanel";
import { ThemesPanel } from "@/components/results/overview/ThemesPanel";
import { OverviewTipHost } from "@/components/results/overview/OverviewTip";
import {
  filterPartners,
  heroCopy,
  OVERVIEW_MAX,
  prefersStaticMotion,
  reachLevel,
  type OverviewKindFilter,
} from "@/lib/overviewModel";
import { businessLabel } from "@/lib/format";
import { matchResearchCity } from "@/lib/researchCities";
import { TasteFocusContext } from "@/components/results/overview/tasteFocus";
import { useOverviewTasteFocus } from "@/components/results/overview/useOverviewTasteFocus";
import { useVenn } from "@/store/useVenn";

type Stat = { value: string; label: string; hint?: string };

/** Four at-a-glance numbers, all derived from the ranked partners on screen. */
function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="ov-stats-strip" aria-label="Summary">
      {stats.map((stat) => (
        <div key={stat.label} className="ov-stat">
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
          {stat.hint ? <span>{stat.hint}</span> : null}
        </div>
      ))}
    </dl>
  );
}

export function OverviewPage() {
  const result = useVenn((s) => s.result);
  const selectedId = useVenn((s) => s.selectedId);
  const hoverId = useVenn((s) => s.hoverId);
  const select = useVenn((s) => s.select);
  const setHover = useVenn((s) => s.setHover);
  const surprise = useVenn((s) => s.surprise);
  const setSurprise = useVenn((s) => s.setSurprise);
  const pinnedIds = useVenn((s) => s.pinnedIds);
  const togglePin = useVenn((s) => s.togglePin);
  const openBrief = useVenn((s) => s.openBrief);
  const loadCompare = useVenn((s) => s.loadCompare);
  const loadHeatmap = useVenn((s) => s.loadHeatmap);
  const heatmaps = useVenn((s) => s.heatmaps);
  const compare = useVenn((s) => s.compare);
  const compareLoading = useVenn((s) => s.compareLoading);

  const [kind, setKind] = useState<OverviewKindFilter>("all");
  const [realistic, setRealistic] = useState(false);
  const [liftOn, setLiftOn] = useState(true);

  const partners = result?.partners ?? [];

  const ranked = useMemo(
    () => filterPartners(partners, { kind, realistic, surprise }).slice(0, OVERVIEW_MAX),
    [partners, kind, realistic, surprise],
  );

  useEffect(() => {
    if (!ranked.length) return;
    if (!ranked.some((p) => p.id === selectedId)) {
      select(ranked[0]!.id);
    }
  }, [ranked, selectedId, select]);

  const selected = partners.find((p) => p.id === selectedId) ?? ranked[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    void loadCompare(selected.id);
    void loadHeatmap(selected.id);
  }, [selected?.id, loadCompare, loadHeatmap]);

  const { focus, announce, everyTaste, pinnedTaste } = useOverviewTasteFocus(ranked, result);

  const heatSpots = selected ? heatmaps[selected.id]?.spots ?? [] : [];
  const comparePayload = selected ? compare[selected.id] ?? null : null;

  const cityCenter = useMemo((): [number, number] => {
    if (result?.city?.hasLocalData && result.city.center) {
      return result.city.center as [number, number];
    }
    return matchResearchCity(result?.input.city ?? "")?.center ?? [51.5074, -0.1278];
  }, [result]);

  const youName = result ? businessLabel(result.input) : "You";

  const anchors = useMemo(() => {
    const fromTaste = (result?.input.tasteAnchors ?? []).map((a) => a.name);
    if (fromTaste.length) return fromTaste;
    return result?.input.anchors ?? [];
  }, [result]);

  const { title: heroTitle, lede: heroLede } = useMemo(
    () => (result ? heroCopy(result, ranked) : { title: "", lede: "" }),
    [result, ranked],
  );

  const staticMotion = prefersStaticMotion();

  useEffect(() => {
    document.body.classList.toggle("hl-on", !!hoverId);
    return () => document.body.classList.remove("hl-on");
  }, [hoverId]);

  const stats = useMemo((): Stat[] => {
    const best = ranked[0];
    const distances = ranked
      .map((p) => p.venueFacts?.distanceM)
      .filter((d): d is number => typeof d === "number");
    const near = distances.filter((d) => d <= 3000).length;
    const easy = ranked.filter((p) => reachLevel(p) === "easy").length;
    const kinds = new Set(ranked.map((p) => p.kind)).size;
    return [
      { value: String(ranked.length), label: "Partners ranked", hint: `${kinds} kind${kinds === 1 ? "" : "s"}` },
      {
        value: best ? String(Math.round(best.matchScore)) : "—",
        label: "Best overlap",
        hint: best ? best.name : undefined,
      },
      { value: String(easy), label: "Easy to reach", hint: `of ${ranked.length}` },
      {
        value: distances.length ? String(near) : "—",
        label: "Within 3 km",
        hint: distances.length ? `of ${distances.length} local` : "no local places",
      },
    ];
  }, [ranked]);

  if (!result) return null;

  return (
    <TasteFocusContext.Provider value={focus}>
    <div className={`ov-page${staticMotion ? " ov-static" : ""}${pinnedTaste ? " is-tastefocus" : ""}`}>
      <OverviewTipHost />
      <div className="sr-only" aria-live="polite" role="status">
        {announce}
      </div>

      <ResultsHeader />

      <main className="ov-wrap">
        <section className="ov-hero" aria-labelledby="ov-h1">
          <div className="ov-hero-copy">
            <h1 id="ov-h1">{heroTitle}</h1>
            <p className="ov-lede">{heroLede}</p>
          </div>
          <StatStrip stats={stats} />
        </section>

        <OverviewFilters
          partners={partners}
          kind={kind}
          surprise={surprise}
          realistic={realistic}
          onKind={setKind}
          onSurprise={setSurprise}
          onRealistic={setRealistic}
        />

        <section className="ov-row ov-row-a">
          <OrbitPanel
            youName={youName}
            partners={ranked}
            selectedId={selectedId}
            hoverId={hoverId}
            setHover={setHover}
            select={select}
          />
          <PicksPanel
            ranked={ranked}
            surprise={surprise}
            selectedId={selectedId}
            hoverId={hoverId}
            setHover={setHover}
            select={select}
          />
        </section>

        <section className="ov-row ov-row-sel">
          <SelectedCard
            partner={selected}
            youLabel={youName}
            pinned={selected ? pinnedIds.has(selected.id) : false}
            onDraft={() => {
              if (selected) void openBrief(selected.id);
            }}
            onTogglePin={() => {
              if (selected) togglePin(selected.id);
            }}
          />
        </section>

        <section className="ov-row ov-row-b">
          <ScatterPanel
            partners={ranked}
            surprise={surprise}
            selectedId={selectedId}
            hoverId={hoverId}
            setHover={setHover}
            select={select}
          />
          <OverviewMapPanel
            partners={ranked}
            cityCenter={cityCenter}
            cityZoom={12}
            heatmapSpots={heatSpots}
            liftOn={liftOn}
            onLiftToggle={setLiftOn}
            selectedId={selectedId}
            hoverId={hoverId}
            setHover={setHover}
            select={select}
          />
        </section>

        <section className="ov-row ov-row-c">
          <SankeyPanel
            anchors={anchors}
            partners={ranked}
            selectedId={selectedId}
            hoverId={hoverId}
            setHover={setHover}
            select={select}
            allTastes={everyTaste}
          />
          {compareLoading || compareHasRows(comparePayload) ? (
            <CompareBarsPanel
              partner={selected}
              payload={comparePayload}
              loading={compareLoading && !!selected && !comparePayload}
            />
          ) : (
            <ThemesPanel partners={ranked} selectedId={selectedId} hoverId={hoverId} setHover={setHover} />
          )}
        </section>

        <footer className="ov-footer">
          <span>Taste data from Qloo. Ranking, ease and surprise added by Venn.</span>
          <span>Venn — Qloo Agentic Hackathon.</span>
        </footer>
      </main>
    </div>
    </TasteFocusContext.Provider>
  );
}

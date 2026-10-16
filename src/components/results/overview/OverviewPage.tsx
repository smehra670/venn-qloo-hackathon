import { useEffect, useMemo, useState } from "react";
import { OverviewFilters } from "@/components/results/overview/OverviewFilters";
import { OrbitPanel } from "@/components/results/overview/OrbitPanel";
import { PicksPanel } from "@/components/results/overview/PicksPanel";
import { SelectedCard } from "@/components/results/overview/SelectedCard";
import { ScatterPanel } from "@/components/results/overview/ScatterPanel";
import { OverviewMapPanel } from "@/components/results/overview/OverviewMapPanel";
import { SankeyPanel } from "@/components/results/overview/SankeyPanel";
import { CompareBarsPanel } from "@/components/results/overview/CompareBarsPanel";
import { QlooWaterfallPanel } from "@/components/results/overview/QlooWaterfallPanel";
import { OverviewTipHost } from "@/components/results/overview/OverviewTip";
import {
  distFor,
  filterPartners,
  heroCopy,
  OVERVIEW_MAX,
  overlapFraction,
  prefersStaticMotion,
  type OverviewKindFilter,
} from "@/lib/overviewModel";
import { matchResearchCity } from "@/lib/researchCities";
import { useVenn } from "@/store/useVenn";

function HeroMiniVenn({ fraction }: { fraction: number }) {
  const R = 26;
  const d = distFor(fraction, R, R);
  const W = 4 * R + 10;
  const H = 2 * R + 8;
  const cy = H / 2;
  return (
    <svg width={110} height={74} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <clipPath id="hero-you-clip">
          <circle cx={R + 5} cy={cy} r={R} />
        </clipPath>
      </defs>
      <circle cx={R + 5} cy={cy} r={R} fill="#FF6B57" />
      <circle cx={R + 5 + d} cy={cy} r={R} fill="#4F5BFF" />
      <circle cx={R + 5 + d} cy={cy} r={R} fill="#6B3FA0" clipPath="url(#hero-you-clip)" />
    </svg>
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
  const calls = useVenn((s) => s.calls);
  const openCallLog = useVenn((s) => s.openCallLog);
  const reset = useVenn((s) => s.reset);

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

  // Prefetch real call log for the waterfall (never invent timings)
  useEffect(() => {
    if (!result) return;
    if ((result.calls?.length ?? 0) > 0) return;
    if (calls.length > 0) return;
    void openCallLog();
  }, [result?.runId, result?.calls, calls.length, openCallLog]);

  const heatSpots = selected ? heatmaps[selected.id]?.spots ?? [] : [];
  const comparePayload = selected ? compare[selected.id] ?? null : null;
  const callRows = (result?.calls?.length ? result.calls : calls) ?? [];

  const cityCenter = useMemo((): [number, number] => {
    if (result?.city?.hasLocalData && result.city.center) {
      return result.city.center as [number, number];
    }
    return matchResearchCity(result?.input.city ?? "")?.center ?? [51.5074, -0.1278];
  }, [result]);

  const youName =
    result?.input.businessName?.trim() ||
    result?.input.businessTypeCustom?.trim() ||
    result?.input.businessType ||
    "You";

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

  if (!result) return null;

  const queryBits = [
    result.input.businessTypeCustom || result.input.businessType,
    result.input.city,
    anchors.slice(0, 2).join(", "),
  ].filter(Boolean);

  return (
    <div className={`ov-page${staticMotion ? " ov-static" : ""}`}>
      <OverviewTipHost />

      <header className="ov-bar">
        <div className="ov-bar-in">
          <a className="ov-brand" href="#/" aria-label="Venn home">
            <svg width="38" height="26" viewBox="0 0 40 28" aria-hidden="true">
              <defs>
                <clipPath id="ov-mk">
                  <circle cx="14" cy="14" r="13" />
                </clipPath>
              </defs>
              <circle cx="14" cy="14" r="13" fill="#FF6B57" />
              <circle cx="26" cy="14" r="13" fill="#4F5BFF" />
              <circle cx="26" cy="14" r="13" fill="#6B3FA0" clipPath="url(#ov-mk)" />
            </svg>
            Venn
          </a>
          <div className="ov-q" aria-label="Your search">
            {queryBits.map((b, i) => (
              <span key={`${b}-${i}`}>
                {i > 0 ? <i /> : null}
                {b}
              </span>
            ))}
          </div>
          <nav className="ov-tabs" aria-label="Views">
            <button type="button" className="on" aria-current="page">
              Overview
            </button>
            <button type="button" onClick={() => useVenn.getState().setView("shortlist")}>
              Shortlist
            </button>
            <button type="button" onClick={() => useVenn.getState().setView("plan")}>
              Plan
            </button>
          </nav>
          <div className="ov-bar-r">
            <button type="button" className="ov-link" onClick={() => void useVenn.getState().shareRun()}>
              Share
            </button>
            <button type="button" className="ov-btn" onClick={reset}>
              New search
            </button>
          </div>
        </div>
      </header>

      <main className="ov-wrap">
        <section className="ov-hero" aria-labelledby="ov-h1">
          <div>
            <h1 id="ov-h1">{heroTitle}</h1>
            <p className="ov-lede">{heroLede}</p>
          </div>
          {selected ? (
            <div className="ov-fig" aria-live="polite">
              <HeroMiniVenn fraction={overlapFraction(selected)} />
              <div className="ov-fig-n">{Math.round(selected.matchScore)}</div>
              <div className="ov-fig-cap">
                <b>{selected.name}</b>
                taste overlap with you, from Qloo
              </div>
            </div>
          ) : null}
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
          <div className="ov-col">
            <PicksPanel
              ranked={ranked}
              surprise={surprise}
              selectedId={selectedId}
              hoverId={hoverId}
              setHover={setHover}
              select={select}
            />
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
          </div>
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
          />
          <CompareBarsPanel
            partner={selected}
            payload={comparePayload}
            loading={compareLoading && !!selected && !comparePayload}
          />
        </section>

        <section className="ov-row">
          <QlooWaterfallPanel calls={callRows} partners={partners} anchors={anchors} />
        </section>

        <footer className="ov-footer">
          <span>Taste data from Qloo. Ranking, ease and surprise added by Venn.</span>
          <span>Venn — Qloo Agentic Hackathon.</span>
        </footer>
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { summaryLine } from "@/lib/format";
import { resolveResearchCenter, RESEARCH_RADIUS_M } from "@/lib/researchCities";
import { parseResearchShotHash } from "@/lib/researchShotFixture";
import { prefersReducedMotion, stepIndex } from "@/lib/researchMotion";
import { Logo } from "@/components/brand/Logo";
import { CirclesLoader } from "@/components/research/CirclesLoader";
import { QlooFeed } from "@/components/research/QlooFeed";
import { ResearchMap } from "@/components/research/ResearchMap";
import { ResearchSteps } from "@/components/research/ResearchSteps";
import { useGatedSteps } from "@/components/research/useGatedSteps";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { deriveSteps, useVenn } from "@/store/useVenn";
import { cn } from "@/lib/cn";

function isClosedPartner(p: { blurb?: string }): boolean {
  return /\bpermanently closed\b/i.test(p.blurb ?? "");
}

export function ResearchScreen({ shotHash = null }: { shotHash?: string | null }) {
  const input = useVenn((state) => state.input);
  const error = useVenn((state) => state.error);
  const settling = useVenn((state) => state.settling);
  const events = useVenn((state) => state.events);
  const result = useVenn((state) => state.result);
  const cancel = useVenn((state) => state.cancelRun);
  const startRun = useVenn((state) => state.startRun);
  const reset = useVenn((state) => state.reset);

  const shot = useMemo(() => (shotHash ? parseResearchShotHash(shotHash) : null), [shotHash]);

  const steps = useMemo(() => deriveSteps(events), [events]);
  const logicStep =
    steps.find((s) => s.state === "running")?.id ??
    [...steps].reverse().find((s) => s.state === "done")?.id ??
    null;
  const done = settling || Boolean(result && !error);
  const gated = useGatedSteps(logicStep, done);

  // Shot harness freezes visuals at a chosen step (Playwright only — no SSE).
  const visualStep = shot ? (shot.done ? "assemble" : shot.step) : gated.visualStep;
  const visualDone = shot ? Boolean(shot.done) : gated.visualDone;
  const stepStartedAt = useMemo(() => {
    if (!shot) return gated.stepStartedAt;
    const elapsed = shot.elapsedMs ?? (shot.done ? 5000 : 1400);
    return Date.now() - elapsed;
  }, [shot, gated.stepStartedAt, shotHash]);

  const center = useMemo(
    () => resolveResearchCenter(input.city, result?.city ?? null),
    [input.city, result?.city],
  );

  const partners = result?.partners ?? [];
  const venuePartners = partners.filter((p) => p.venueFacts);
  const brandPartners = partners.filter((p) => !p.venueFacts);
  const foundCount = venuePartners.length;
  const openCount = venuePartners.filter((p) => !isClosedPartner(p)).length;
  const closedCount = venuePartners.filter((p) => isClosedPartner(p)).length;
  const radiusKm = Math.round((RESEARCH_RADIUS_M / 1000) * 10) / 10;

  const plannedKinds = useMemo(() => {
    const note = events.find(
      (e) => e.type === "step_note" && e.step === "plan" && "text" in e && /Looking at:/i.test(e.text),
    );
    if (note && note.type === "step_note") {
      const m = note.text.match(/Looking at:\s*(.+)\./i);
      if (m?.[1]) return m[1].split(",").map((s) => s.trim()).filter(Boolean);
    }
    return result?.plannedKinds ?? [];
  }, [events, result?.plannedKinds]);

  const zeroResults =
    Boolean(result) &&
    venuePartners.length === 0 &&
    (stepIndex(visualStep) >= stepIndex("discover") || visualDone);

  const useMap = center != null;

  // Header chips become empty outlines once anchors have flown onto the map
  const [anchorsFlown, setAnchorsFlown] = useState(false);
  useEffect(() => {
    if (!useMap) {
      setAnchorsFlown(false);
      return;
    }
    if (prefersReducedMotion() || visualDone || stepIndex(visualStep) > stepIndex("resolve")) {
      setAnchorsFlown(true);
      return;
    }
    if (visualStep !== "resolve") {
      setAnchorsFlown(false);
      return;
    }
    setAnchorsFlown(false);
    const t = window.setTimeout(() => setAnchorsFlown(true), 1000);
    return () => window.clearTimeout(t);
  }, [useMap, visualStep, visualDone, stepStartedAt]);

  // Opt into the fluid root font size (see index.css) so the whole stage scales with the screen.
  useEffect(() => {
    document.documentElement.classList.add("fluid-ui");
    return () => document.documentElement.classList.remove("fluid-ui");
  }, []);

  return (
    <div className="relative flex min-h-dvh w-full min-w-full flex-col overflow-x-hidden bg-white font-sans text-[#14151A]">
      <header className="page-shell relative z-10 flex h-14 shrink-0 items-center lg:h-[3.75rem]">
        <Logo />
      </header>
      <main className="page-shell relative z-10 flex w-full min-w-0 flex-1 flex-col pb-3 lg:pb-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <h1 className="text-[2.1rem] font-bold leading-[1.04] tracking-[-0.04em] text-[#14151A] lg:text-[2.75rem]">
          {error
            ? "The search paused."
            : settling || visualDone
              ? "Found your overlap."
              : "Looking for crowds like yours…"}
        </h1>
        <ul className="flex list-none flex-wrap gap-2 p-0 lg:pb-1.5" aria-label="What you asked for">
          <li className="inline-flex h-[2.125rem] items-center rounded-full bg-[#F4F5F7] px-3.5 text-[0.95rem] font-semibold tracking-[-0.005em]">
            {input.businessTypeCustom || input.businessType || "business"}
          </li>
          <li className="inline-flex h-[2.125rem] items-center rounded-full bg-[#F4F5F7] px-3.5 text-[0.95rem] font-semibold tracking-[-0.005em]">
            {input.city || "city"}
          </li>
          {input.anchors.slice(0, 4).map((anchor) => (
            <li
              key={anchor}
              className={cn(
                "inline-flex h-[2.125rem] items-center rounded-full px-3.5 text-[0.95rem] font-semibold tracking-[-0.005em] transition-colors duration-300",
                useMap && anchorsFlown ? "bg-[#F4F5F7] text-[#14151A]" : "bg-[#FFE8E3] text-[#14151A]",
              )}
            >
              {anchor}
            </li>
          ))}
        </ul>
        </div>
        <p className="sr-only">{summaryLine(input)}</p>

        {error ? (
          <div className="mt-8">
            <EmptyState
              title="Something got in the way"
              body={error}
              action={
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={() => void startRun(input)}>
                    Try again
                  </Button>
                  <Button type="button" variant="secondary" onClick={reset}>
                    Edit my answers
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 items-stretch gap-5 lg:mt-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-6">
            <div className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-4">
              <ResearchSteps
                className="order-2 lg:order-none"
                visualStep={visualStep}
                visualDone={visualDone}
                events={events}
                city={input.city}
                foundCount={foundCount}
                openCount={openCount}
                closedCount={closedCount}
                radiusKm={radiusKm}
              />
              <QlooFeed className="order-3 lg:order-none" events={events} />
            </div>

            <div className="order-1 min-h-0 lg:order-none">
              {useMap ? (
                <ResearchMap
                  center={center}
                  cityName={result?.city?.name || input.city}
                  businessName={input.businessName || input.businessTypeCustom || input.businessType || "you"}
                  anchors={input.anchors}
                  plannedKinds={plannedKinds}
                  visualStep={visualStep}
                  visualDone={visualDone}
                  stepStartedAt={stepStartedAt}
                  partners={partners}
                  zeroResults={zeroResults}
                  onSeePartners={() => {
                    useVenn.setState({ stage: "results", settling: false });
                  }}
                />
              ) : (
                <div className="overflow-hidden rounded-3xl border border-[#E3E6EB] bg-[#F4F5F7]">
                  <CirclesLoader />
                  {brandPartners.length > 0 ? (
                    <p className="px-4 pb-4 text-center text-[0.9rem] text-[#596070]">
                      No map for this city — showing taste matches as brands and artists.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        {!error ? (
          <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 lg:mt-3">
            <Button type="button" variant="ghost" onClick={() => void cancel()}>
              Cancel
            </Button>
            <Badge tone="sky">Qloo Agentic Hackathon 2026 Entry</Badge>
          </div>
        ) : null}
      </main>
    </div>
  );
}

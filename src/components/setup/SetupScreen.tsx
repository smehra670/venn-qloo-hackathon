import type { BusinessInput, ExampleInput } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { AboutDialog } from "@/components/about/AboutDialog";
import { AmbientCircles } from "@/components/brand/AmbientCircles";
import { Logo } from "@/components/brand/Logo";
import { ExampleChips } from "@/components/setup/ExampleChips";
import { FineTune } from "@/components/setup/FineTune";
import { SampleGraph } from "@/components/setup/SampleGraph";
import { SentenceForm, validationMessage } from "@/components/setup/SentenceForm";
import { SwipePanel } from "@/components/setup/swipe/SwipePanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useSwipe } from "@/store/useSwipe";
import { useVenn } from "@/store/useVenn";

const FALLBACK: ExampleInput[] = [
  { businessType: "cafe", city: "London", anchors: ["Aesop", "Radiohead", "pilates"], businessName: "Brew & Co" },
  { businessType: "gym_studio", city: "Manchester", anchors: ["Patagonia", "craft beer", "bouldering"] },
  { businessType: "retail_shop", city: "New York", anchors: ["Bandcamp", "Polaroid", "natural wine"], businessName: "Second Spin Records" },
];

export function SetupScreen() {
  const input = useVenn((state) => state.input);
  const setInput = useVenn((state) => state.setInput);
  const startRun = useVenn((state) => state.startRun);
  const meta = useVenn((state) => state.meta);
  const health = useVenn((state) => state.health);
  const [busy, setBusy] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const fromExampleRef = useRef(false);
  const reason = validationMessage(input);
  const examples = meta?.examples.length ? meta.examples : FALLBACK;
  const cities = meta?.demoCities ?? ["London", "Manchester", "New York"];
  const deckOpen = useSwipe((state) => state.mode !== "idle");

  // A deck is built for one business type and city: changing either closes it and drops the cards.
  useEffect(() => {
    const swipe = useSwipe.getState();
    if (swipe.mode !== "idle" || swipe.deckKey) swipe.invalidate();
  }, [input.businessType, input.city]);

  // The cover opts into the fluid root font size (see index.css); other stages keep 16px.
  useEffect(() => {
    document.documentElement.classList.add("fluid-ui");
    return () => document.documentElement.classList.remove("fluid-ui");
  }, []);

  useEffect(() => {
    const syncHash = () => setAboutOpen(window.location.hash === "#about");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const closeAbout = () => {
    setAboutOpen(false);
    if (window.location.hash === "#about") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  const handleInputChange = (next: BusinessInput) => {
    fromExampleRef.current = false;
    setInput(next);
  };

  const fillExample = (example: ExampleInput) => {
    fromExampleRef.current = true;
    setInput({ ...example, anchors: [], tasteAnchors: undefined, anchorNotes: undefined });
    example.anchors.forEach((anchor, index) => {
      window.setTimeout(() => {
        const current = useVenn.getState().input;
        if (current.city !== example.city) return;
        if (current.anchors.includes(anchor)) return;
        setInput({ ...current, anchors: [...current.anchors, anchor].slice(0, 6) });
      }, 120 * (index + 1));
    });
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (reason || busy) return;
    const cleaned: BusinessInput = {
      ...input,
      city: input.city.trim(),
      businessName: input.businessName?.trim() || undefined,
      businessTypeCustom: input.businessTypeCustom?.trim() || undefined,
      // Confirmed signals only; typed strings stay for headlines/notes.
      tasteAnchors: input.tasteAnchors?.length ? input.tasteAnchors : undefined,
      anchorNotes: input.anchorNotes?.length ? input.anchorNotes : undefined,
    };
    setBusy(true);
    try {
      await startRun(cleaned);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full min-w-full flex-col overflow-x-hidden bg-paper">
      <AmbientCircles />
      <header className="page-shell relative z-10 flex shrink-0 items-center justify-between gap-3 py-3 lg:py-4">
        <Logo />
        <nav className="flex items-center gap-5 text-sm text-ink-soft" aria-label="Primary">
          <button type="button" className="min-h-11 hover:text-ink" onClick={() => setAboutOpen(true)}>
            About
          </button>
          <a
            className="min-h-11 inline-flex items-center hover:text-ink"
            href="https://github.com/smehra670/venn-inhouse"
            target="_blank"
            rel="noreferrer"
          >
            Source code
          </a>
        </nav>
      </header>

      {/*
        Cover layout: below lg the stages stack and the page scrolls. From lg up the
        form column and the example card sit side by side, sized in rem against the
        fluid root font size, so the whole cover fits one screen at any laptop/desktop size.
      */}
      <main className="relative z-10 flex w-full min-w-0 flex-1 flex-col">
        <section className="page-shell grid flex-1 grid-cols-1 items-center gap-8 py-4 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] lg:gap-[3.5rem] lg:py-3">
          <div className="min-w-0 w-full">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Taste collaboration agent · powered by Qloo
            </p>
            <h1 className="mt-3 w-full text-balance text-[2.25rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-[2.75rem] lg:text-[3rem]">
              Find partners whose audiences already overlap with yours.
            </h1>
            <p className="mt-3 w-full text-base leading-relaxed text-ink-soft lg:mt-3.5 lg:text-[1.05rem]">
              Name your business and a few brands, artists or places your customers love. Venn searches public taste data, ranks nearby collab fits by shared crowd, and drafts the pitch you can send.
            </p>

            <form className="mt-5 flex w-full flex-col gap-3.5 lg:mt-6" onSubmit={(event) => void submit(event)}>
              <SentenceForm
                input={input}
                cities={cities}
                onChange={handleInputChange}
                demo={health?.demo || health?.provider === "mock"}
              />
              <FineTune input={input} onChange={handleInputChange} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="submit" disabled={Boolean(reason) || busy} className="min-h-12 shrink-0 px-7 text-base">
                  {busy ? "Starting…" : "Find my partners"}
                </Button>
                <p className="max-w-sm text-sm leading-snug text-ink-soft">
                  {input.anchors.length < 1 ? "Add at least one taste to start." : input.anchors.length < 3 ? "You can go now. 3 or more works best." : "Ready."}
                </p>
              </div>
              {reason && input.anchors.length > 0 ? <p className="text-sm text-ink-soft">{reason}</p> : null}
              <ExampleChips examples={examples} onPick={fillExample} />
            </form>
          </div>

          {/* From lg the card is pinned to the visible area (viewport minus header, footer and padding) */}
          <div
            className={
              deckOpen
                ? "min-w-0 w-full lg:sticky lg:top-3 lg:self-start lg:flex lg:justify-center"
                : "min-w-0 w-full lg:sticky lg:top-3 lg:self-start lg:h-[calc(100dvh-var(--cover-chrome))] lg:min-h-[28rem]"
            }
          >
            <SwipePanel onFind={() => void submit()}>
              <SampleGraph />
            </SwipePanel>
          </div>
        </section>
      </main>

      <footer className="relative z-10 shrink-0 border-t border-line bg-paper/80 py-3 text-sm text-ink-soft backdrop-blur-sm">
        <div className="page-shell flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <span>Venn, a taste collaboration agent, powered by Qloo data.</span>
            <Badge tone="sky">Qloo Agentic Hackathon 2026 Entry</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button type="button" className="link-underline" onClick={() => setAboutOpen(true)}>
              About
            </button>
            <a className="link-underline inline-flex items-center" href="https://github.com/smehra670/venn-inhouse" target="_blank" rel="noreferrer">
              Source code
            </a>
          </div>
        </div>
      </footer>

      <AboutDialog open={aboutOpen} onClose={closeAbout} version={health?.version} />
    </div>
  );
}

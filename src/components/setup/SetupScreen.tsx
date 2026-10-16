import type { BusinessInput, ExampleInput } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { AboutDialog } from "@/components/about/AboutDialog";
import { AmbientCircles } from "@/components/brand/AmbientCircles";
import { Logo } from "@/components/brand/Logo";
import { ExampleChips } from "@/components/setup/ExampleChips";
import { FineTune } from "@/components/setup/FineTune";
import { SampleGraph } from "@/components/setup/SampleGraph";
import { SentenceForm, validationMessage } from "@/components/setup/SentenceForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
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
    <div className="relative min-h-dvh overflow-x-hidden bg-paper">
      <AmbientCircles />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 md:px-8">
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

      <main className="relative z-10">
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-2 md:grid-cols-[1.05fr_0.95fr] md:gap-12 md:px-8 md:pb-20 md:pt-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Taste collaboration agent · powered by Qloo
            </p>
            <h1 className="mt-3 max-w-xl text-[clamp(2rem,4.5vw,3.25rem)] font-bold leading-[1.08] tracking-tight text-ink">
              Find partners whose audiences already overlap with yours.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-soft md:text-[1.05rem]">
              Name your business and a few brands, artists or places your customers love. Venn searches public taste data, ranks nearby collab fits by shared crowd, and drafts the pitch you can send.
            </p>

            <form className="mt-8 flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
              <SentenceForm
                input={input}
                cities={cities}
                onChange={handleInputChange}
                demo={health?.demo || health?.provider === "mock"}
              />
              <FineTune input={input} onChange={handleInputChange} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="submit" disabled={Boolean(reason) || busy} className="min-h-12 px-7 text-base">
                  {busy ? "Starting…" : "Find my partners"}
                </Button>
                <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
                  No CRM upload. Only public taste signals — then a shortlist, map, and ready-to-send brief.
                </p>
              </div>
              {reason ? <p className="text-sm text-ink-soft">{reason}</p> : null}
              <ExampleChips examples={examples} onPick={fillExample} />
            </form>
          </div>

          <div className="min-w-0">
            <SampleGraph />
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line bg-paper/80 px-4 py-6 text-sm text-ink-soft backdrop-blur-sm md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <span>Venn, a taste collaboration agent, powered by Qloo data.</span>
            <Badge tone="sky">Qloo Agentic Hackathon 2026 Entry</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button type="button" className="link-underline min-h-11" onClick={() => setAboutOpen(true)}>
              About
            </button>
            <a className="link-underline min-h-11 inline-flex items-center" href="https://github.com/smehra670/venn-inhouse" target="_blank" rel="noreferrer">
              Source code
            </a>
          </div>
        </div>
      </footer>

      <AboutDialog open={aboutOpen} onClose={closeAbout} version={health?.version} />
    </div>
  );
}

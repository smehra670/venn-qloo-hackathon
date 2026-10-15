import type { AnchorResolution, BusinessInput, ExampleInput } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { AboutDialog } from "@/components/about/AboutDialog";
import { AmbientCircles } from "@/components/brand/AmbientCircles";
import { Logo } from "@/components/brand/Logo";
import { AnchorConfirm } from "@/components/setup/AnchorConfirm";
import { ExampleChips } from "@/components/setup/ExampleChips";
import { FineTune } from "@/components/setup/FineTune";
import { SentenceForm, validationMessage } from "@/components/setup/SentenceForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { resolveAnchors } from "@/lib/api";
import { useVenn } from "@/store/useVenn";

function providerBadge(health: { provider: string; providerLabel: string; demo: boolean } | null): string {
  if (!health) return "Demo data";
  if (health.providerLabel.toLowerCase().includes("saved")) return health.providerLabel;
  if (health.provider === "qloo") return "Powered by Qloo";
  return "Demo data";
}

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
  const [confirmState, setConfirmState] = useState<{ input: BusinessInput; resolutions: AnchorResolution[] } | null>(null);
  // Examples are pre-confirmed (the demo dataset is written so they always resolve cleanly),
  // so submitting one skips the "Check your anchors" step entirely. Any manual edit clears
  // this, since the user is no longer necessarily using the example's exact anchors.
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
    setInput({ ...example, anchors: [] });
    example.anchors.forEach((anchor, index) => {
      window.setTimeout(() => {
        const current = useVenn.getState().input;
        if (current.city !== example.city) return;
        if (current.anchors.includes(anchor)) return;
        setInput({ ...current, anchors: [...current.anchors, anchor].slice(0, 6) });
      }, 120 * (index + 1));
    });
  };

  const runNow = async (next: BusinessInput) => {
    setBusy(true);
    try {
      await startRun(next);
    } finally {
      setBusy(false);
      setConfirmState(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason || busy) return;
    const cleaned: BusinessInput = {
      ...input,
      city: input.city.trim(),
      businessName: input.businessName?.trim() || undefined,
      businessTypeCustom: input.businessTypeCustom?.trim() || undefined,
    };
    if (fromExampleRef.current) {
      await runNow(cleaned);
      return;
    }
    setBusy(true);
    try {
      const resolutions = await resolveAnchors(cleaned.anchors, cleaned.city);
      const needsConfirm = resolutions.some((item) => item.status !== "auto");
      if (needsConfirm) {
        setConfirmState({ input: cleaned, resolutions });
        setBusy(false);
        return;
      }
      await runNow(cleaned);
    } catch {
      // The confirm step is advisory; if it fails, fall back to running directly.
      await runNow(cleaned);
    }
  };

  if (confirmState) {
    return (
      <div className="relative min-h-dvh overflow-hidden">
        <AmbientCircles />
        <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-10">
          <Logo />
          <Badge>{providerBadge(health)}</Badge>
        </header>
        <main className="relative z-10 mx-auto max-w-3xl px-5 pb-16 pt-8 md:px-8 md:pt-16">
          <AnchorConfirm
            resolutions={confirmState.resolutions}
            busy={busy}
            onBack={() => setConfirmState(null)}
            onConfirm={(anchors) => void runNow({ ...confirmState.input, anchors })}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <AmbientCircles />
      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-10">
        <Logo />
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="text-sm" onClick={() => setAboutOpen(true)}>
            About
          </Button>
          <Badge>{providerBadge(health)}</Badge>
        </div>
      </header>
      <main className="relative z-10 mx-auto flex max-w-3xl flex-col gap-8 px-5 pb-16 pt-8 md:px-8 md:pt-16">
        <div>
          <h1 className="font-serif text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.95] tracking-tight">Find who shares your crowd.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            Tell Venn what you run and what your customers love. It finds the businesses whose audiences overlap with yours, then writes the pitch.
          </p>
        </div>
        <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
          <SentenceForm input={input} cities={cities} onChange={handleInputChange} />
          <FineTune input={input} onChange={handleInputChange} />
          <div className="flex flex-col items-start gap-3">
            <Button type="submit" disabled={Boolean(reason) || busy}>
              {busy ? "Starting…" : "Find my partners"}
            </Button>
            {reason ? <p className="text-sm text-ink-soft">{reason}</p> : null}
            <p className="text-sm text-ink-soft">No customer data needed. Venn only uses public brands, artists and places.</p>
          </div>
        </form>
        <ExampleChips examples={examples} onPick={fillExample} />
      </main>
      <footer className="relative z-10 border-t border-line px-5 py-6 text-sm text-ink-soft md:px-10">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <span>Venn · MIT · taste collaboration agent</span>
          <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setAboutOpen(true)}>
            About &amp; Qloo surfaces
          </button>
        </div>
      </footer>
      <AboutDialog open={aboutOpen} onClose={closeAbout} version={health?.version} />
    </div>
  );
}

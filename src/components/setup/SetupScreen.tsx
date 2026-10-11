import type { ExampleInput } from "@shared/types";
import { useState } from "react";
import { AmbientCircles } from "@/components/brand/AmbientCircles";
import { Logo } from "@/components/brand/Logo";
import { ExampleChips } from "@/components/setup/ExampleChips";
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
  const reason = validationMessage(input);
  const examples = meta?.examples.length ? meta.examples : FALLBACK;
  const cities = meta?.demoCities ?? ["London", "Manchester", "New York"];

  const fillExample = (example: ExampleInput) => {
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

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <AmbientCircles />
      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-10">
        <Logo />
        <Badge>{health?.provider === "qloo" ? "Powered by Qloo" : "Demo data"}</Badge>
      </header>
      <main className="relative z-10 mx-auto flex max-w-3xl flex-col gap-8 px-5 pb-16 pt-8 md:px-8 md:pt-16">
        <div>
          <h1 className="font-serif text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.95] tracking-tight">Find who shares your crowd.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            Tell Venn what you run and what your customers love. It finds the businesses whose audiences overlap with yours, then writes the pitch.
          </p>
        </div>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason || busy) return;
            setBusy(true);
            void startRun({
              ...input,
              city: input.city.trim(),
              businessName: input.businessName?.trim() || undefined,
              businessTypeCustom: input.businessTypeCustom?.trim() || undefined,
            }).finally(() => setBusy(false));
          }}
        >
          <SentenceForm input={input} cities={cities} onChange={setInput} />
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
    </div>
  );
}

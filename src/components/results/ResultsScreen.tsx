import { Info } from "lucide-react";
import { BriefSheet } from "@/components/results/BriefSheet";
import { MapView } from "@/components/results/MapView";
import { PartnerDrawer } from "@/components/results/PartnerDrawer";
import { ShortlistView } from "@/components/results/ShortlistView";
import { TopPicks } from "@/components/results/TopPicks";
import { MobileTabs, TopBar } from "@/components/results/TopBar";
import { VennGraph } from "@/components/results/graph/VennGraph";
import { Tooltip } from "@/components/ui/Tooltip";
import { useVenn } from "@/store/useVenn";
import { useEffect } from "react";

export function ResultsScreen() {
  const result = useVenn((state) => state.result);
  const view = useVenn((state) => state.view);
  const briefOpen = useVenn((state) => state.briefOpen);
  const closeBrief = useVenn((state) => state.closeBrief);
  const select = useVenn((state) => state.select);
  const selectedId = useVenn((state) => state.selectedId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (briefOpen) {
        closeBrief();
        return;
      }
      if (selectedId) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefOpen, closeBrief, select, selectedId]);

  if (!result) return null;

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <div className="flex items-start gap-2 px-4 pb-2 pt-4 md:px-6">
        <h1 className="line-clamp-2 font-serif text-2xl tracking-tight md:text-3xl">{result.headline}</h1>
        <Tooltip label="Match scores are relative to this search and describe group-level taste, not individual customers.">
          <button type="button" aria-label="About match scores" className="mt-1 rounded-full p-1 text-ink-soft">
            <Info size={16} />
          </button>
        </Tooltip>
      </div>
      <div className="relative min-h-0 flex-1">
        {view === "graph" ? (
          <div className="flex h-full min-h-0 flex-col overflow-auto pb-16 md:pb-3">
            <div className="min-h-[280px] flex-1">
              <VennGraph />
            </div>
            <div className="shrink-0 px-4 pt-3">
              <TopPicks />
            </div>
          </div>
        ) : null}
        {view === "map" ? <MapView /> : null}
        {view === "shortlist" ? <ShortlistView /> : null}
        <PartnerDrawer />
      </div>
      <MobileTabs />
      <BriefSheet />
    </div>
  );
}

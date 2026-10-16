import { BriefSheet } from "@/components/results/BriefSheet";
import { OverviewPage } from "@/components/results/overview/OverviewPage";
import { PartnerDrawer } from "@/components/results/PartnerDrawer";
import { PlanView } from "@/components/results/PlanView";
import { QlooCallLog } from "@/components/results/QlooCallLog";
import { ShortlistView } from "@/components/results/ShortlistView";
import { MobileTabs, TopBar } from "@/components/results/TopBar";
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

  if (view === "overview") {
    return (
      <>
        <OverviewPage />
        <QlooCallLog />
        <BriefSheet />
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <TopBar />
      <div className="relative min-h-0 flex-1 overflow-auto pb-16 md:pb-3">
        {view === "shortlist" ? <ShortlistView /> : null}
        {view === "plan" ? <PlanView /> : null}
        <PartnerDrawer />
        <QlooCallLog />
      </div>
      <MobileTabs />
      <BriefSheet />
    </div>
  );
}

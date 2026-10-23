import { BriefSheet } from "@/components/results/BriefSheet";
import { ChatPanel } from "@/components/results/ChatPanel";
import { OverviewPage } from "@/components/results/overview/OverviewPage";
import { PartnerDrawer } from "@/components/results/PartnerDrawer";
import { ProofView } from "@/components/results/ProofView";
import { QlooCallLog } from "@/components/results/QlooCallLog";
import { ResultsHeader } from "@/components/results/ResultsHeader";
import { ShortlistView } from "@/components/results/ShortlistView";
import { useVenn } from "@/store/useVenn";
import { useEffect } from "react";

export function ResultsScreen() {
  const result = useVenn((state) => state.result);
  const view = useVenn((state) => state.view);
  const briefOpen = useVenn((state) => state.briefOpen);
  const closeBrief = useVenn((state) => state.closeBrief);
  const select = useVenn((state) => state.select);
  const selectedId = useVenn((state) => state.selectedId);

  // Every results tab opts into the fluid root font size (see index.css) so type and charts
  // scale with the screen, matching the cover and research stages.
  useEffect(() => {
    document.documentElement.classList.add("fluid-ui");
    return () => document.documentElement.classList.remove("fluid-ui");
  }, []);

  // The Overview always has a partner selected (it drives every chart). On Shortlist a
  // selection opens the drawer, so start that tab with nothing selected; the Overview picks
  // its top partner again when you come back.
  useEffect(() => {
    if (view !== "overview") useVenn.getState().select(null);
  }, [view]);

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
        <ChatPanel />
      </>
    );
  }

  // Shortlist and Proof share the dashboard's page, bar and card styling (`ov-*`).
  return (
    <div className="ov-page">
      <ResultsHeader />
      <main className="ov-wrap">
        {view === "shortlist" ? <ShortlistView /> : null}
        {view === "proof" ? <ProofView /> : null}
      </main>
      <PartnerDrawer />
      <QlooCallLog />
      <BriefSheet />
      <ChatPanel />
    </div>
  );
}

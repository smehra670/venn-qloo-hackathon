import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ResearchScreen } from "@/components/research/ResearchScreen";
import { ResultsScreen } from "@/components/results/ResultsScreen";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { ShareView } from "@/components/share/ShareView";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { parseResearchShotHash, researchShotState } from "@/lib/researchShotFixture";
import { useVenn } from "@/store/useVenn";

const SHARE_PREFIX = "#share/";

function applyResearchShot(hash: string): boolean {
  const shot = parseResearchShotHash(hash);
  if (!shot) return false;
  useVenn.setState(researchShotState(shot));
  return true;
}

export function App() {
  const stage = useVenn((state) => state.stage);
  const boot = useVenn((state) => state.boot);
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (applyResearchShot(hash)) return;
    void boot();
  }, [boot, hash]);

  const shareToken = hash.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null;
  const isResearchShot = Boolean(parseResearchShotHash(hash));

  return (
    <TooltipProvider>
      {shareToken ? (
        <ShareView key={shareToken} token={shareToken} />
      ) : (
        <>
          {stage === "setup" ? <SetupScreen /> : null}
          {stage === "researching" ? (
            <ResearchScreen key={isResearchShot ? hash : "live"} shotHash={isResearchShot ? hash : null} />
          ) : null}
          {stage === "results" ? <ResultsScreen /> : null}
        </>
      )}
      <Toaster
        theme="light"
        toastOptions={{
          style: {
            background: "#FFFFFF",
            color: "#14151A",
            border: "1px solid #E5E7EB",
            borderRadius: "16px",
            boxShadow: "none",
            fontFamily: "Bricolage Grotesque Variable, sans-serif",
            fontSize: "15px",
          },
        }}
      />
    </TooltipProvider>
  );
}

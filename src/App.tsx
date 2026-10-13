import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ResearchScreen } from "@/components/research/ResearchScreen";
import { ResultsScreen } from "@/components/results/ResultsScreen";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { ShareView } from "@/components/share/ShareView";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { useVenn } from "@/store/useVenn";

const SHARE_PREFIX = "#share/";

export function App() {
  const stage = useVenn((state) => state.stage);
  const boot = useVenn((state) => state.boot);
  useEffect(() => {
    void boot();
  }, [boot]);

  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const shareToken = hash.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null;

  return (
    <TooltipProvider>
      {shareToken ? (
        <ShareView key={shareToken} token={shareToken} />
      ) : (
        <>
          {stage === "setup" ? <SetupScreen /> : null}
          {stage === "researching" ? <ResearchScreen /> : null}
          {stage === "results" ? <ResultsScreen /> : null}
        </>
      )}
      <Toaster
        theme="light"
        toastOptions={{
          style: {
            background: "#FFFDF8",
            color: "#1B1A2E",
            border: "1px solid rgba(27, 26, 46, 0.1)",
            fontFamily: "Geist Variable, sans-serif",
          },
        }}
      />
    </TooltipProvider>
  );
}

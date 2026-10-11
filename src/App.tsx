import { useEffect } from "react";
import { Toaster } from "sonner";
import { ResearchScreen } from "@/components/research/ResearchScreen";
import { ResultsScreen } from "@/components/results/ResultsScreen";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { useVenn } from "@/store/useVenn";

export function App() {
  const stage = useVenn((state) => state.stage);
  const boot = useVenn((state) => state.boot);
  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <TooltipProvider>
      {stage === "setup" ? <SetupScreen /> : null}
      {stage === "researching" ? <ResearchScreen /> : null}
      {stage === "results" ? <ResultsScreen /> : null}
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

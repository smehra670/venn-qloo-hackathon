import { summaryLine } from "@/lib/format";
import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { useVenn, type ResultsView } from "@/store/useVenn";

const OPTIONS: { value: ResultsView; label: string }[] = [
  { value: "graph", label: "Graph" },
  { value: "map", label: "Map" },
  { value: "shortlist", label: "Shortlist" },
  { value: "proof", label: "Proof" },
  { value: "plan", label: "Plan" },
];

export function TopBar() {
  const result = useVenn((state) => state.result);
  const view = useVenn((state) => state.view);
  const setView = useVenn((state) => state.setView);
  const reset = useVenn((state) => state.reset);
  const health = useVenn((state) => state.health);
  const shareRun = useVenn((state) => state.shareRun);
  const sharing = useVenn((state) => state.sharing);
  const openCallLog = useVenn((state) => state.openCallLog);
  if (!result) return null;
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
      <Logo />
      <span className="rounded-full bg-paper-2 px-3 py-1 text-sm text-ink-soft">{summaryLine(result.input)}</span>
      <div className="hidden md:block">
        <Segmented value={view} onChange={setView} options={OPTIONS} label="Result view" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={() => void openCallLog()}>How Venn used Qloo</Button>
        <Button type="button" variant="ghost" disabled={sharing} onClick={() => void shareRun()}>
          {sharing ? "Copying…" : "Share"}
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>New search</Button>
        <Badge>
          {result.providerLabel.toLowerCase().includes("saved")
            ? result.providerLabel
            : health?.provider === "qloo" || result.provider === "qloo"
              ? "Powered by Qloo"
              : "Demo data"}
        </Badge>
      </div>
    </header>
  );
}

export function MobileTabs() {
  const view = useVenn((state) => state.view);
  const setView = useVenn((state) => state.setView);
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card p-2 md:hidden">
      <Segmented value={view} onChange={setView} options={OPTIONS} label="Result view" />
    </div>
  );
}

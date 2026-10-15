import { summaryLine } from "@/lib/format";
import { AmbientCircles } from "@/components/brand/AmbientCircles";
import { Logo } from "@/components/brand/Logo";
import { CirclesLoader } from "@/components/research/CirclesLoader";
import { StepTimeline } from "@/components/research/StepTimeline";
import { ToolLog } from "@/components/research/ToolLog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useVenn } from "@/store/useVenn";

export function ResearchScreen() {
  const input = useVenn((state) => state.input);
  const error = useVenn((state) => state.error);
  const settling = useVenn((state) => state.settling);
  const cancel = useVenn((state) => state.cancelRun);
  const startRun = useVenn((state) => state.startRun);
  const reset = useVenn((state) => state.reset);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-paper">
      <AmbientCircles subtle />
      <header className="relative z-10 mx-auto flex max-w-5xl items-center px-4 py-5 md:px-8">
        <Logo />
      </header>
      <main className="relative z-10 mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-12 md:px-8">
        <div>
          <h1 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold tracking-tight text-ink">
            {error ? "The search paused." : settling ? "Found your overlap." : "Looking for crowds like yours…"}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="sand">{input.businessTypeCustom || input.businessType || "business"}</Badge>
            <Badge tone="sky">{input.city || "city"}</Badge>
            {input.anchors.slice(0, 3).map((anchor, index) => (
              <Badge key={anchor} tone={index === 0 ? "coral" : index === 1 ? "blue" : "plum"}>
                {anchor}
              </Badge>
            ))}
          </div>
          <p className="sr-only">{summaryLine(input)}</p>
        </div>
        {error ? (
          <EmptyState
            title="Something got in the way"
            body={error}
            action={
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => void startRun(input)}>
                  Try again
                </Button>
                <Button type="button" variant="secondary" onClick={reset}>
                  Edit my answers
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid items-start gap-8 md:grid-cols-2">
            <div className="rounded-[20px] border border-line bg-paper p-5">
              <StepTimeline />
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-[20px] border border-line bg-paper p-2 sm:p-3">
                <CirclesLoader />
              </div>
              <ToolLog />
            </div>
          </div>
        )}
        {!error ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => void cancel()}>
              Cancel
            </Button>
            <Badge tone="sky">Qloo Agentic Hackathon 2026 Entry</Badge>
          </div>
        ) : null}
      </main>
    </div>
  );
}

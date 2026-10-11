import { summaryLine } from "@/lib/format";
import { CirclesLoader } from "@/components/research/CirclesLoader";
import { StepTimeline } from "@/components/research/StepTimeline";
import { ToolLog } from "@/components/research/ToolLog";
import { Button } from "@/components/ui/Button";
import { useVenn } from "@/store/useVenn";

export function ResearchScreen() {
  const input = useVenn((state) => state.input);
  const error = useVenn((state) => state.error);
  const settling = useVenn((state) => state.settling);
  const cancel = useVenn((state) => state.cancelRun);
  const startRun = useVenn((state) => state.startRun);
  const reset = useVenn((state) => state.reset);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-5 py-8 md:px-10">
      <div>
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
          {error ? "The search paused." : settling ? "Found your overlap." : "Looking for crowds like yours…"}
        </h1>
        <p className="mt-3 text-ink-soft">{summaryLine(input)}</p>
      </div>
      {error ? (
        <section className="max-w-xl rounded-[20px] border border-line bg-card p-6 shadow-soft">
          <p className="text-lg">{error}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void startRun(input)}>
              Try again
            </Button>
            <Button type="button" variant="secondary" onClick={reset}>
              Edit my answers
            </Button>
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <StepTimeline />
          <div className="flex flex-col gap-4">
            <CirclesLoader />
            <ToolLog />
          </div>
        </div>
      )}
      {!error ? (
        <div>
          <Button type="button" variant="ghost" onClick={() => void cancel()}>
            Cancel
          </Button>
        </div>
      ) : null}
    </main>
  );
}

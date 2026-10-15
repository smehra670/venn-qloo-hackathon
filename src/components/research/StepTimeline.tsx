import { deriveSteps, useVenn } from "@/store/useVenn";
import { cn } from "@/lib/cn";

export function StepTimeline() {
  const events = useVenn((state) => state.events);
  const steps = deriveSteps(events);
  const current = [...steps].reverse().find((step) => step.state !== "waiting");

  return (
    <div>
      <ol className="flex flex-col gap-4">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-3">
            <span
              className={cn(
                "tabular mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                step.state === "waiting" && "bg-surface text-ink-soft",
                step.state === "running" && "bg-ink text-paper",
                step.state === "done" && "bg-ink text-paper",
                step.state === "retry" && "bg-[#f3e8d4] text-ink",
              )}
              aria-hidden="true"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="font-bold text-ink">{step.title}</p>
              {step.state === "done" && step.summary ? <p className="text-sm text-ink-soft">{step.summary}</p> : null}
              {step.note ? <p className="text-sm text-ink-soft">{step.note}</p> : null}
              {step.retry ? <p className="text-sm text-amber-900">{step.retry}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <div aria-live="polite" className="sr-only">
        {current ? `${current.title}. ${current.summary ?? current.retry ?? ""}` : "Waiting to start"}
      </div>
    </div>
  );
}

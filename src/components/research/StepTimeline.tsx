import { Check } from "lucide-react";
import { deriveSteps, useVenn } from "@/store/useVenn";
import { cn } from "@/lib/cn";

export function StepTimeline() {
  const events = useVenn((state) => state.events);
  const steps = deriveSteps(events);
  const current = [...steps].reverse().find((step) => step.state !== "waiting");

  return (
    <div>
      <ol className="flex flex-col gap-4">
        {steps.map((step) => (
          <li key={step.id} className="flex gap-3">
            <span
              className={cn(
                "mt-1 h-3 w-3 shrink-0 rounded-full border border-line bg-card",
                step.state === "running" && "animate-pulse bg-blue",
                step.state === "done" && "border-ink bg-ink",
                step.state === "retry" && "border-amber-700 bg-amber-200",
              )}
              aria-hidden="true"
            />
            <div>
              <p className="font-medium text-ink">{step.title}</p>
              {step.state === "done" && step.summary ? <p className="text-sm text-ink-soft">{step.summary}</p> : null}
              {step.note ? <p className="text-sm text-ink-soft">{step.note}</p> : null}
              {step.retry ? <p className="text-sm text-amber-900">{step.retry}</p> : null}
              {step.state === "done" ? <Check className="sr-only" /> : null}
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

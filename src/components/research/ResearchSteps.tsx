import { useMemo, type CSSProperties } from "react";
import type { AgentEvent, StepId } from "@shared/types";
import { cn } from "@/lib/cn";
import {
  RESEARCH_STEP_ORDER,
  RESEARCH_STEP_TITLES,
  stepIndex,
} from "@/lib/researchMotion";

function sublineFor(
  step: StepId,
  visualStep: StepId | null,
  visualDone: boolean,
  events: AgentEvent[],
  city: string,
  foundCount: number,
  openCount: number,
  closedCount: number,
  radiusKm: number,
): string {
  const notes = events
    .filter((e): e is Extract<AgentEvent, { type: "step_note" }> => e.type === "step_note" && e.step === step)
    .map((e) => e.text);
  const completed = events.find(
    (e): e is Extract<AgentEvent, { type: "step_completed" }> =>
      e.type === "step_completed" && e.step === step,
  );
  const completedSummary = completed?.summary;
  const idx = stepIndex(step);
  const vIdx = stepIndex(visualStep);
  const active = !visualDone && idx === vIdx;
  const done = visualDone || idx < vIdx;

  if (step === "resolve") {
    if (active && !done) return notes.at(-1) ?? "Matching your anchors…";
    return completedSummary ?? "Matched your anchors";
  }
  if (step === "plan") {
    if (active && !done) return notes.at(-1) ?? "Picking where to look…";
    return completedSummary ?? `Searching within ${radiusKm} km`;
  }
  if (step === "discover") {
    if (foundCount > 0) {
      return active && !done
        ? `${foundCount} places found`
        : (completedSummary ?? `${foundCount} places found`);
    }
    const zeroKnown =
      completedSummary != null ||
      notes.some((n) => /0 places|no places/i.test(n)) ||
      events.some(
        (e) =>
          e.type === "tool_result" &&
          e.step === "discover" &&
          /0 places|no places/i.test(e.summary),
      );
    // Zero results: once we know the answer, stop the "looking" copy.
    if (zeroKnown || (done && foundCount === 0)) {
      return "No places found nearby";
    }
    if (active && !done) return notes.at(-1) ?? "Looking nearby…";
    return completedSummary ?? "No places found nearby";
  }
  if (step === "score") {
    if (active && !done) {
      const n = foundCount || "…";
      return notes.at(-1) ?? (typeof n === "number" ? `Scoring ${n} of ${n}` : `Scoring ${n}`);
    }
    return completedSummary ?? `Scored on taste overlap`;
  }
  if (step === "enrich") {
    if (active && !done) return notes.at(-1) ?? "Comparing with how busy each area is";
    return completedSummary ?? "Busy areas found";
  }
  if (step === "adapt") {
    if (active && !done) return notes.at(-1) ?? "Checking they are still open…";
    if (openCount + closedCount > 0) return `${openCount} open, ${closedCount} closed`;
    return completedSummary ?? "Coverage checked";
  }
  if (step === "assemble") {
    if (active && !done) return notes.at(-1) ?? "Placing partners on your map…";
    return completedSummary ?? (openCount > 0 ? `${openCount} partners ready` : `Map for ${city}`);
  }
  return notes.at(-1) ?? completedSummary ?? "";
}

export function ResearchSteps({
  visualStep,
  visualDone,
  events,
  city,
  foundCount,
  openCount,
  closedCount,
  radiusKm,
  className,
}: {
  visualStep: StepId | null;
  visualDone: boolean;
  events: AgentEvent[];
  city: string;
  foundCount: number;
  openCount: number;
  closedCount: number;
  radiusKm: number;
  className?: string;
}) {
  const vIdx = stepIndex(visualStep);

  const rows = useMemo(
    () =>
      RESEARCH_STEP_ORDER.map((id) => {
        const idx = stepIndex(id);
        const done = visualDone || idx < vIdx;
        const active = !visualDone && idx === vIdx;
        const fill = done ? 1 : active ? 0.55 : 0;
        const sub = sublineFor(
          id,
          visualStep,
          visualDone,
          events,
          city,
          foundCount,
          openCount,
          closedCount,
          radiusKm,
        );
        return { id, done, active, fill, sub, title: RESEARCH_STEP_TITLES[id] };
      }),
    [
      visualStep,
      visualDone,
      events,
      city,
      foundCount,
      openCount,
      closedCount,
      radiusKm,
      vIdx,
    ],
  );

  return (
    <ol
      className={cn(
        "list-none rounded-3xl border border-[#E3E6EB] bg-white p-2 lg:p-1.5",
        className,
      )}
      aria-label="Research steps"
    >
      {rows.map((row, i) => (
        <li
          key={row.id}
          className={cn(
            "relative grid grid-cols-[2.125rem_1fr] gap-x-3.5 rounded-2xl px-3.5 py-2.5 transition-colors duration-300 lg:py-[0.3rem]",
            row.active && "bg-[#F4F5F7]",
          )}
          style={
            i < rows.length - 1
              ? ({
                  ["--fill" as string]: row.fill,
                } as CSSProperties)
              : undefined
          }
        >
          {i < rows.length - 1 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute left-[1.875rem] top-[2.6rem] bottom-[-0.5rem] z-[1] w-0.5 rounded-sm lg:top-[2.35rem] lg:bottom-[-0.45rem]"
              style={{
                background: `linear-gradient(#14151A calc(var(--fill, 0) * 100%), #E3E6EB 0)`,
              }}
            />
          ) : null}
          <span
            className={cn(
              "relative z-[2] grid size-[2.125rem] place-items-center rounded-full border-[1.5px] bg-white text-[0.85rem] font-bold transition-[background-color,color,border-color] duration-300",
              row.done
                ? "border-[#14151A] bg-[#14151A] text-white"
                : row.active
                  ? "border-[#14151A] text-[#14151A]"
                  : "border-[#C4C9D2] text-[#8A91A0]",
            )}
          >
            {row.done ? (
              <svg className="size-[2.125rem]" viewBox="0 0 34 34" aria-hidden>
                <path
                  d="M10.5 17.5l4.3 4.3 8.7-9.2"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : row.active ? (
              <>
                <span className="num">{i + 1}</span>
                <svg
                  className="absolute -inset-[3px] size-10 motion-safe:animate-spin"
                  viewBox="0 0 40 40"
                  aria-hidden
                  style={{ animationDuration: "1.1s" }}
                >
                  <circle
                    cx="20"
                    cy="20"
                    r="18"
                    fill="none"
                    stroke="#4F5BFF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="28 120"
                  />
                </svg>
              </>
            ) : (
              <span>{i + 1}</span>
            )}
          </span>
          <span className="min-w-0 pt-1 lg:pt-0.5">
            <b
              className={cn(
                "block text-[1.02rem] font-semibold leading-snug tracking-[-0.01em] transition-colors duration-300",
                row.active || row.done ? "text-[#14151A]" : "text-[#8A91A0]",
              )}
            >
              {row.title}
            </b>
            {(row.active || row.done) && row.sub ? (
              <span className="block text-[0.92rem] leading-snug text-[#596070]">{row.sub}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

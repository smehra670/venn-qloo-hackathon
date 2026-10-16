import { useEffect, useRef, useState } from "react";
import type { StepId } from "@shared/types";
import {
  RESEARCH_STEP_MIN_MS,
  RESEARCH_STEP_ORDER,
  prefersReducedMotion,
  stepIndex,
} from "@/lib/researchMotion";

/**
 * Gates visual step advances so each step shows for at least RESEARCH_STEP_MIN_MS.
 * Logic / SSE are untouched — only what the Research UI displays.
 */
export function useGatedSteps(
  logicStep: StepId | null,
  done: boolean,
): { visualStep: StepId | null; visualDone: boolean; stepStartedAt: number } {
  const [visualStep, setVisualStep] = useState<StepId | null>(null);
  const [visualDone, setVisualDone] = useState(false);
  const [stepStartedAt, setStepStartedAt] = useState(() => Date.now());
  const queueRef = useRef<StepId[]>([]);
  const shownRef = useRef<StepId | null>(null);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      if (done) {
        setVisualStep("assemble");
        setVisualDone(true);
        return;
      }
      if (logicStep) {
        setVisualStep(logicStep);
        setVisualDone(false);
        shownRef.current = logicStep;
        startedAtRef.current = Date.now();
        setStepStartedAt(startedAtRef.current);
      }
      return;
    }

    const enqueue = (step: StepId) => {
      const cur = shownRef.current;
      if (cur === step) return;
      if (queueRef.current.includes(step)) return;
      if (cur && stepIndex(step) <= stepIndex(cur)) return;
      queueRef.current.push(step);
      drain();
    };

    const drain = () => {
      if (timerRef.current != null) return;
      const next = queueRef.current[0];
      if (!next) {
        if (done && shownRef.current === "assemble") {
          const elapsed = Date.now() - startedAtRef.current;
          const wait = Math.max(0, RESEARCH_STEP_MIN_MS - elapsed);
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setVisualDone(true);
          }, wait);
        }
        return;
      }

      const cur = shownRef.current;
      if (!cur) {
        queueRef.current.shift();
        shownRef.current = next;
        startedAtRef.current = Date.now();
        setStepStartedAt(startedAtRef.current);
        setVisualStep(next);
        setVisualDone(false);
        drain();
        return;
      }

      const elapsed = Date.now() - startedAtRef.current;
      const wait = Math.max(0, RESEARCH_STEP_MIN_MS - elapsed);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        queueRef.current.shift();
        shownRef.current = next;
        startedAtRef.current = Date.now();
        setStepStartedAt(startedAtRef.current);
        setVisualStep(next);
        setVisualDone(false);
        drain();
      }, wait);
    };

    if (logicStep) enqueue(logicStep);

    if (done) {
      // Ensure every step through assemble has been queued.
      for (const s of RESEARCH_STEP_ORDER) {
        if (stepIndex(s) > stepIndex(shownRef.current)) {
          if (!queueRef.current.includes(s) && shownRef.current !== s) {
            queueRef.current.push(s);
          }
        }
      }
      if (shownRef.current !== "assemble" && !queueRef.current.includes("assemble")) {
        queueRef.current.push("assemble");
      }
      drain();
    } else {
      drain();
    }

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [logicStep, done]);

  return { visualStep, visualDone, stepStartedAt };
}

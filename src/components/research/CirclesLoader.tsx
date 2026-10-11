import { STEP_ORDER } from "@shared/types";
import { motion, useReducedMotion } from "framer-motion";
import { deriveSteps, useVenn } from "@/store/useVenn";

export function CirclesLoader() {
  const events = useVenn((state) => state.events);
  const settling = useVenn((state) => state.settling);
  const reduced = useReducedMotion();
  const done = deriveSteps(events).filter((step) => step.state === "done").length;
  const progress = settling ? 1 : done / STEP_ORDER.length;
  const shift = 70 - progress * 58;

  return (
    <div className="relative mx-auto h-64 w-full max-w-md" aria-hidden="true">
      <motion.div
        className="absolute top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-coral/55"
        animate={{ left: `calc(50% - ${shift + 80}px)` }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 18 }}
      />
      <motion.div
        className="absolute top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-blue/50"
        animate={{ left: `calc(50% + ${shift - 80}px)` }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 18 }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-plum/50"
        animate={{ width: 36 + progress * 70, height: 36 + progress * 70 }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 18 }}
      />
    </div>
  );
}

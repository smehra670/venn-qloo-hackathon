import { STEP_ORDER } from "@shared/types";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { deriveSteps, useVenn } from "@/store/useVenn";

const PARTNER_COLORS = ["#4f5bff", "#6b3fa0", "#1FA89A", "#E8A33D", "#D9468F", "#ff6b57"] as const;

/** Progress viz for research: hub + growing partner constellation (not a flat Venn). */
export function CirclesLoader() {
  const events = useVenn((state) => state.events);
  const settling = useVenn((state) => state.settling);
  const input = useVenn((state) => state.input);
  const reduced = useReducedMotion();
  const steps = deriveSteps(events);
  const done = steps.filter((step) => step.state === "done").length;
  const running = steps.find((step) => step.state === "running");
  const progress = settling ? 1 : Math.min(1, done / STEP_ORDER.length);

  const visibleCount = Math.max(2, Math.round(2 + progress * 6));
  const nodes = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => {
        const angle = -Math.PI / 2 + (index / 8) * Math.PI * 2 + progress * 0.35;
        const radius = 78 + (index % 3) * 18;
        return {
          id: index,
          x: 200 + Math.cos(angle) * radius,
          y: 168 + Math.sin(angle) * radius,
          color: PARTNER_COLORS[index % PARTNER_COLORS.length]!,
          r: 9 + (index % 3) * 2,
          visible: index < visibleCount,
        };
      }),
    [progress, visibleCount],
  );

  const status = settling
    ? "Overlap locked in"
    : running
      ? running.title
      : done === 0
        ? "Warming up the search"
        : `${done} of ${STEP_ORDER.length} steps done`;

  const circumference = 2 * Math.PI * 54;

  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <svg viewBox="0 0 400 320" className="h-auto w-full">
        <defs>
          <radialGradient id="research-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff6b57" stopOpacity="0.18" />
            <stop offset="45%" stopColor="#4f5bff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="research-ribbon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff6b57" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#4f5bff" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        <circle cx="200" cy="168" r="130" fill="url(#research-glow)" />

        {/* Progress ring */}
        <circle cx="200" cy="168" r="54" fill="none" stroke="#eef0f4" strokeWidth="6" />
        <motion.circle
          cx="200"
          cy="168"
          r="54"
          fill="none"
          stroke="#14151a"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 80, damping: 18 }}
          transform="rotate(-90 200 168)"
        />

        {/* Soft guide rings */}
        {[78, 108, 136].map((r) => (
          <circle key={r} cx="200" cy="168" r={r} fill="none" stroke="#eceef2" strokeWidth="1" />
        ))}

        {nodes.map((node, index) => {
          if (!node.visible) return null;
          const midX = 200 + (node.x - 200) * 0.42;
          const midY = 168 + (node.y - 168) * 0.42;
          const d = `M 200 168 Q ${midX} ${midY} ${node.x} ${node.y}`;
          return (
            <g key={node.id}>
              <motion.path
                d={d}
                fill="none"
                stroke="url(#research-ribbon)"
                strokeWidth="1.6"
                strokeLinecap="round"
                initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.35 + progress * 0.35 }}
                transition={{ duration: 0.55, delay: index * 0.05 }}
              />
              <motion.circle
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={node.color}
                stroke="#fff"
                strokeWidth="2"
                initial={reduced ? false : { scale: 0, opacity: 0 }}
                animate={
                  reduced
                    ? { scale: 1, opacity: 1 }
                    : { scale: [1, 1.08, 1], opacity: 1 }
                }
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        scale: { duration: 2.4 + index * 0.15, repeat: Infinity, ease: "easeInOut" },
                        opacity: { duration: 0.35, delay: index * 0.05 },
                      }
                }
                style={{ transformOrigin: `${node.x}px ${node.y}px` }}
              />
            </g>
          );
        })}

        {/* Hub */}
        <motion.circle
          cx="200"
          cy="168"
          r="28"
          fill="#ff6b57"
          animate={reduced ? undefined : { scale: [1, 1.05, 1] }}
          transition={reduced ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "200px 168px" }}
        />
        <circle cx="200" cy="168" r="28" fill="none" stroke="#fff" strokeWidth="3" />
        <text x="200" y="165" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">
          You
        </text>
        <text x="200" y="178" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="7" fontWeight="600">
          {(input.businessName || input.businessType || "biz").slice(0, 12)}
        </text>

        <text x="200" y="28" textAnchor="middle" fill="#14151a" fontSize="12" fontWeight="700">
          {Math.round(progress * 100)}% mapped
        </text>
        <text x="200" y="46" textAnchor="middle" fill="#5b6170" fontSize="10">
          {status}
        </text>
      </svg>
    </div>
  );
}

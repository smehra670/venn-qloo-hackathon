import { STEP_ORDER, type StepId } from "@shared/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { deriveSteps, useVenn } from "@/store/useVenn";

const KIND_SHORT: Record<string, string> = {
  music: "Music",
  culture: "Culture",
  fashion: "Fashion",
  retail: "Retail",
  fitness: "Fitness",
  wellness: "Wellness",
  food: "Food",
  drink: "Drinks",
  venue: "Venues",
};

const STEP_HINT: Partial<Record<StepId, string>> = {
  resolve: "Matching brands and topics to taste signals",
  plan: "Choosing which partner types to search",
  discover: "Pulling candidates whose crowds overlap yours",
  score: "Ranking by shared audience strength",
  enrich: "Checking local fit and recent momentum",
  adapt: "Widening the net if coverage is thin",
  assemble: "Drawing your shortlist and map",
};

const KIND_ORDER = ["music", "culture", "fashion", "retail", "fitness", "wellness", "food", "drink", "venue"] as const;

/**
 * Research progress panel: readable % + step copy, animated audience overlap,
 * and partner-kind rows that light up as the search advances.
 */
export function CirclesLoader() {
  const events = useVenn((state) => state.events);
  const settling = useVenn((state) => state.settling);
  const input = useVenn((state) => state.input);
  const reduced = useReducedMotion();
  const steps = deriveSteps(events);
  const done = steps.filter((step) => step.state === "done").length;
  const running = steps.find((step) => step.state === "running");
  const progress = settling ? 1 : Math.min(1, done / STEP_ORDER.length);
  const pct = Math.round(progress * 100);

  const status = settling
    ? "Overlap locked in"
    : running
      ? running.title
      : done === 0
        ? "Warming up the search"
        : `${done} of ${STEP_ORDER.length} steps done`;

  const hint = settling
    ? "Your shortlist is ready."
    : running
      ? (STEP_HINT[running.id] ?? "Working…")
      : "Connecting to taste data…";

  const youLabel = (input.businessName || input.businessTypeCustom || input.businessType || "You").slice(0, 22);

  // How many partner-kind rows feel "active" based on progress / discover notes.
  const activeKinds = useMemo(() => {
    const plan = steps.find((step) => step.id === "plan");
    const fromNote = plan?.summary?.match(/\b(music|culture|fashion|retail|fitness|wellness|food|drink|venue)\b/gi) ?? [];
    const listed = [...new Set(fromNote.map((k) => k.toLowerCase()))];
    const pool = listed.length > 0 ? listed : [...KIND_ORDER];
    const count = settling ? pool.length : Math.max(1, Math.round(progress * pool.length));
    return pool.slice(0, count);
  }, [steps, progress, settling]);

  const overlapScale = 0.55 + progress * 0.45;

  return (
    <div
      className="circles-loader relative overflow-hidden rounded-[18px] bg-paper"
      aria-hidden="true"
      data-testid="circles-loader"
    >
      {/* Atmosphere — soft wash, not flat grey */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 28% 40%, rgba(255,107,87,0.16), transparent 55%), radial-gradient(ellipse 70% 55% at 72% 45%, rgba(79,91,255,0.14), transparent 50%), radial-gradient(ellipse 50% 40% at 50% 80%, rgba(107,63,160,0.08), transparent 60%)",
        }}
      />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        {/* Header: progress + step */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Audience overlap</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={status}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="mt-1 truncate text-lg font-bold tracking-tight text-ink sm:text-xl"
              >
                {status}
              </motion.p>
            </AnimatePresence>
            <p className="mt-1 text-sm text-ink-soft">{hint}</p>
          </div>
          <div className="shrink-0 text-right">
            <motion.p
              className="font-mono text-3xl font-bold tabular-nums tracking-tight text-ink sm:text-4xl"
              animate={reduced ? undefined : { opacity: [0.85, 1, 0.85] }}
              transition={reduced ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              {pct}%
            </motion.p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">mapped</p>
          </div>
        </div>

        {/* Progress track */}
        <div className="h-1.5 overflow-hidden rounded-full bg-paper">
          <motion.div
            className="h-full rounded-full bg-ink"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }}
          />
        </div>

        {/* Overlap visual */}
        <div className="relative mx-auto aspect-[16/10] w-full max-w-sm">
          <svg viewBox="0 0 320 200" className="h-full w-full" role="presentation">
            <defs>
              <clipPath id="you-clip">
                <circle cx="118" cy="100" r="72" />
              </clipPath>
              <linearGradient id="scan-fade" x1="160" y1="100" x2="200" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#14151a" stopOpacity="0" />
                <stop offset="100%" stopColor="#14151a" stopOpacity="0.18" />
              </linearGradient>
            </defs>

            <motion.circle
              cx="118"
              cy="100"
              r="72"
              fill="#ff6b57"
              fillOpacity={0.22}
              animate={reduced ? undefined : { cx: [118, 114, 118] }}
              transition={reduced ? undefined : { duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
              cx="202"
              cy="100"
              r="72"
              fill="#4f5bff"
              fillOpacity={0.2}
              animate={reduced ? undefined : { cx: [202, 206, 202] }}
              transition={reduced ? undefined : { duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            />

            <g clipPath="url(#you-clip)">
              <motion.circle
                cx="202"
                cy="100"
                r="72"
                fill="#6b3fa0"
                initial={false}
                animate={{ fillOpacity: 0.12 + progress * 0.38, scale: overlapScale }}
                style={{ transformOrigin: "160px 100px" }}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 70, damping: 16 }}
              />
            </g>

            {!settling && !reduced ? (
              <motion.g
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                style={{ transformOrigin: "160px 100px" }}
              >
                <path d="M160 100 L160 28 A72 72 0 0 1 218 55 Z" fill="url(#scan-fade)" opacity="0.4" />
              </motion.g>
            ) : null}

            <circle cx="118" cy="100" r="72" fill="none" stroke="#ff6b57" strokeOpacity="0.55" strokeWidth="2" />
            <circle cx="202" cy="100" r="72" fill="none" stroke="#4f5bff" strokeOpacity="0.5" strokeWidth="2" />

            <text x="88" y="104" textAnchor="middle" fill="#14151a" fontSize="12" fontWeight="700">
              You
            </text>
            <text x="88" y="118" textAnchor="middle" fill="#5b6170" fontSize="9" fontWeight="600">
              {youLabel.length > 14 ? `${youLabel.slice(0, 13)}…` : youLabel}
            </text>
            <text x="232" y="104" textAnchor="middle" fill="#14151a" fontSize="12" fontWeight="700">
              Partners
            </text>
            <text x="232" y="118" textAnchor="middle" fill="#5b6170" fontSize="9" fontWeight="600">
              {settling ? "Shortlist ready" : "Finding overlap"}
            </text>
          </svg>
        </div>

        {/* Partner kinds lighting up */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Searching kinds</p>
          <ul className="flex flex-col gap-1.5">
            {KIND_ORDER.slice(0, 6).map((kind, index) => {
              const active = activeKinds.includes(kind) || (settling && index < 6);
              const label = KIND_SHORT[kind] ?? kind;
              const fill = Math.min(1, Math.max(0, progress * 1.2 - index * 0.12));
              return (
                <li key={kind} className="flex items-center gap-3">
                  <span
                    className={`w-20 shrink-0 text-xs font-medium capitalize ${active ? "text-ink" : "text-ink-soft/50"}`}
                  >
                    {label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: active
                          ? "linear-gradient(90deg, #ff6b57 0%, #4f5bff 100%)"
                          : "#e5e7eb",
                      }}
                      initial={false}
                      animate={{ width: `${Math.round((active ? Math.max(fill, 0.2) : 0) * 100)}%` }}
                      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 100, damping: 18 }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

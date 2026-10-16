import { cn } from "@/lib/cn";

/** Two circles sliding together as progress goes 0 → 100% (reference gauge). */
export function PercentGauge({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const p = Math.min(100, Math.max(0, percent));
  const sep = 34 - 24 * (p / 100);
  const cxA = 31 - sep / 2;
  const cxB = 31 + sep / 2;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full bg-white/92 px-4.5 py-2 shadow-[0_1px_2px_rgba(20,21,26,.06),0_8px_22px_rgba(20,21,26,.09)] backdrop-blur-[8px]",
        className,
      )}
      aria-label={`${p}% mapped`}
    >
      <svg width="62" height="34" viewBox="0 0 62 34" aria-hidden="true">
        <defs>
          <clipPath id="research-gauge-clip">
            <circle cx={cxA} cy="17" r="15" />
          </clipPath>
        </defs>
        <circle cx={cxA} cy="17" r="15" fill="#FF6B57" />
        <circle cx={cxB} cy="17" r="15" fill="#4F5BFF" />
        <circle cx={cxB} cy="17" r="15" fill="#6B3FA0" clipPath="url(#research-gauge-clip)" />
      </svg>
      <div>
        <div className="text-[1.65rem] font-bold leading-none tracking-[-0.04em] tabular-nums text-[#14151A]">
          {Math.round(p)}
          <small className="ml-0.5 text-[0.9rem] font-semibold">%</small>
        </div>
        <div className="text-[0.84rem] leading-tight text-[#596070] max-[560px]:hidden">mapped</div>
      </div>
    </div>
  );
}

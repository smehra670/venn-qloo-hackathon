import { useId } from "react";
import { clamp } from "@/lib/format";

export function MatchRing({ score, size = 92, caption = false }: { score: number; size?: number; caption?: boolean }) {
  const clipId = useId();
  const t = clamp((score - 52) / 44, 0, 1);
  const r = size * 0.22;
  const gap = size * (0.16 - t * 0.1);
  const cx = size / 2;
  const cy = size / 2;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <clipPath id={clipId}>
          <circle cx={cx - gap} cy={cy} r={r} />
        </clipPath>
        <circle cx={cx - gap} cy={cy} r={r} fill="#FF6B57" fillOpacity={0.7} />
        <circle cx={cx + gap} cy={cy} r={r} fill="#4F5BFF" fillOpacity={0.65} />
        <circle cx={cx + gap} cy={cy} r={r} fill="#6B3FA0" fillOpacity={0.55} clipPath={`url(#${clipId})`} />
        <text x={cx} y={cy + 5} textAnchor="middle" className="fill-ink font-serif text-lg">
          {score}
        </text>
      </svg>
      {caption ? <p className="text-center font-mono text-[11px] text-ink-soft">match (relative to this search)</p> : null}
    </div>
  );
}

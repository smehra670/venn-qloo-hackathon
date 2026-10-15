import { useId } from "react";
import { cn } from "@/lib/cn";

export function Logo({ wordmark = true, size = "md" }: { wordmark?: boolean; size?: "md" | "lg" }) {
  const lensId = useId();
  const mark = size === "lg" ? { w: 36, h: 26 } : { w: 28, h: 20 };
  const text = size === "lg" ? "text-3xl font-bold tracking-tight" : "text-xl font-bold tracking-tight";

  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <svg width={mark.w} height={mark.h} viewBox="0 0 64 40" aria-hidden="true">
        <circle cx="22" cy="20" r="14" fill="#FF6B57" fillOpacity="0.92" />
        <circle cx="42" cy="20" r="14" fill="#4F5BFF" fillOpacity="0.9" />
        <clipPath id={lensId}>
          <circle cx="22" cy="20" r="14" />
        </clipPath>
        <circle cx="42" cy="20" r="14" fill="#6B3FA0" fillOpacity="0.95" clipPath={`url(#${lensId})`} />
      </svg>
      {wordmark ? <span className={cn(text)}>Venn</span> : null}
    </span>
  );
}

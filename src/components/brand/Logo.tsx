import { useId } from "react";
import { cn } from "@/lib/cn";

export function Logo({ wordmark = true, size = "md" }: { wordmark?: boolean; size?: "md" | "lg" }) {
  const lensId = useId();
  // rem-sized so the mark scales with the fluid root font size (identical to 28x20 / 36x26 px at 16px).
  const mark = size === "lg" ? "h-[1.625rem] w-[2.25rem]" : "h-5 w-7";
  const text = size === "lg" ? "text-3xl font-bold tracking-tight" : "text-xl font-bold tracking-tight";

  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <svg className={cn("shrink-0", mark)} viewBox="0 0 64 40" aria-hidden="true">
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

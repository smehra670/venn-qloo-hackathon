import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "sky" | "coral" | "blue" | "plum" | "mint" | "sand";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface text-ink-soft",
  sky: "bg-[#d7eef7] text-ink",
  coral: "bg-coral-soft text-ink",
  blue: "bg-blue-soft text-ink",
  plum: "bg-[#efe6f7] text-ink",
  mint: "bg-[#d8f3ec] text-ink",
  sand: "bg-[#f3e8d4] text-ink",
};

export function Badge({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-medium tracking-tight",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

import { cn } from "@/lib/cn";

export function Badge({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-line bg-card px-3 py-1 text-xs tracking-wide text-ink-soft", className)}>
      {children}
    </span>
  );
}

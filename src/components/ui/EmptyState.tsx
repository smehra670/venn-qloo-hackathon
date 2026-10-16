import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  body,
  className,
  action,
}: {
  title: string;
  body: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-[16px] border border-line bg-paper p-6", className)}>
      <h3 className="text-2xl font-bold tracking-tight text-ink">{title}</h3>
      <p className="max-w-md text-base leading-relaxed text-ink-soft">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

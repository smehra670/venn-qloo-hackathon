import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Chip({
  children,
  onRemove,
  onClick,
  pressed,
  className,
}: {
  children: string;
  onRemove?: () => void;
  onClick?: () => void;
  pressed?: boolean;
  className?: string;
}) {
  const body = <span className="truncate">{children}</span>;
  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={pressed}
        onClick={onClick}
        className={cn("rounded-full border border-line bg-card px-3 py-1 text-sm text-ink", pressed && "bg-blue-soft", className)}
      >
        {body}
      </button>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-paper-2 px-3 py-1 text-sm text-ink", className)}>
      {body}
      {onRemove ? (
        <button type="button" aria-label={`Remove ${children}`} onClick={onRemove} className="rounded-full p-0.5 text-ink-soft hover:text-ink">
          <X size={14} />
        </button>
      ) : null}
    </span>
  );
}

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
        className={cn(
          "min-h-11 rounded-[12px] border border-line bg-paper px-3.5 py-2 text-sm text-ink",
          pressed && "border-ink bg-ink text-paper",
          className,
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <span className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-[12px] border border-line bg-paper px-3 py-1.5 text-sm text-ink", className)}>
      {body}
      {onRemove ? (
        <button type="button" aria-label={`Remove ${children}`} onClick={onRemove} className="rounded p-1 text-ink-soft hover:text-ink">
          <X size={14} />
        </button>
      ) : null}
    </span>
  );
}

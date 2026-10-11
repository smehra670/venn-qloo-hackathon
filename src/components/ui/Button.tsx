import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-ink text-paper hover:bg-ink/90",
        variant === "secondary" && "border border-line bg-card text-ink hover:bg-paper-2",
        variant === "ghost" && "text-ink-soft hover:bg-paper-2 hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

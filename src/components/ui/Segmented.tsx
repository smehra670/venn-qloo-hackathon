import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/cn";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      className="inline-flex rounded-full bg-paper-2 p-1"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm text-ink-soft data-[state=on]:bg-card data-[state=on]:text-ink data-[state=on]:shadow-soft",
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

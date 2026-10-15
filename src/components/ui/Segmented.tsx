import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/cn";

/** Plain text tabs with a 2px ink underline on the active item. */
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
      className="inline-flex flex-wrap gap-1"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            "min-h-11 rounded-none border-b-2 border-transparent px-3 py-2 text-sm text-ink-soft transition data-[state=on]:border-ink data-[state=on]:font-bold data-[state=on]:text-ink",
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

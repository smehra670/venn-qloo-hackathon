import type { ExampleInput } from "@shared/types";
import { businessLabel } from "@/lib/format";

export function ExampleChips({
  examples,
  onPick,
}: {
  examples: ExampleInput[];
  onPick: (example: ExampleInput) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-soft">Try an example</span>
      {examples.map((example) => (
        <button
          key={`${example.city}-${example.businessType}`}
          type="button"
          onClick={() => onPick(example)}
          className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink hover:bg-paper-2"
        >
          {businessLabel(example)} in {example.city}
        </button>
      ))}
    </div>
  );
}

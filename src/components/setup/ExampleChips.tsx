import type { ExampleInput } from "@shared/types";
import { businessLabel } from "@/lib/format";

export function ExampleChips({
  examples,
  onPick,
}: {
  examples: ExampleInput[];
  onPick: (example: ExampleInput) => void;
}) {
  if (examples.length === 0) return null;
  return (
    <p id="examples" className="text-sm leading-relaxed text-ink-soft">
      Try{" "}
      {examples.map((example, index) => {
        const label = example.businessName
          ? `${example.businessName} in ${example.city}`
          : `${businessLabel(example)} in ${example.city}`;
        const sep = index === 0 ? "" : index === examples.length - 1 ? ", or " : ", ";
        return (
          <span key={`${example.city}-${example.businessType}`}>
            {sep}
            <button type="button" className="link-underline text-ink" onClick={() => onPick(example)}>
              {label}
            </button>
          </span>
        );
      })}
      .
    </p>
  );
}

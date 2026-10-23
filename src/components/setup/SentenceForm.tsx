import { BUSINESS_TYPES, type BusinessInput, type BusinessType } from "@shared/types";
import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { CrowdSection } from "@/components/setup/CrowdSection";
import { cn } from "@/lib/cn";

/** @deprecated The anchor input is now part of CrowdSection (swipe or type). */
export { CrowdSection as AnchorInput };

export function validationMessage(input: BusinessInput): string | null {
  if (input.businessType === "other" && (input.businessTypeCustom ?? "").trim().length < 2) {
    return "Describe your business in a few words.";
  }
  if (input.city.trim().length < 2) return "Enter a city.";
  if (input.anchors.length < 1) return "Add at least one thing your customers love.";
  if (input.businessName && input.businessName.length > 60) return "Keep the name under 60 characters.";
  const hasTaste = (input.tasteAnchors?.length ?? 0) > 0;
  const onlyNotes =
    input.anchors.length > 0 &&
    (input.anchorNotes?.length ?? 0) >= input.anchors.length &&
    !hasTaste;
  if (onlyNotes) return "Pick at least one matched name or topic to rank partners.";
  return null;
}

function Phrase({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2 text-[1.1rem] leading-[1.6] text-ink lg:text-[1.2rem]">{children}</div>;
}

export function SentenceForm({
  input,
  cities,
  onChange,
  demo,
}: {
  input: BusinessInput;
  cities: string[];
  onChange: (input: BusinessInput) => void;
  compact?: boolean;
  demo?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Phrase>
        <span>I run a</span>
        <span className="relative inline-flex items-center">
          <select
            aria-label="Business type"
            value={input.businessType}
            onChange={(event) => onChange({ ...input, businessType: event.target.value as BusinessType })}
            className="field-underline cursor-pointer appearance-none pr-6"
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {BUSINESS_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
        </span>
        {input.businessType === "other" ? (
          <input
            aria-label="Custom business type"
            value={input.businessTypeCustom ?? ""}
            placeholder="flower shop"
            onChange={(event) => onChange({ ...input, businessTypeCustom: event.target.value })}
            className={cn("field-underline w-[9rem]")}
          />
        ) : null}
        <span>called</span>
        <input
          aria-label="Business name"
          value={input.businessName ?? ""}
          placeholder="optional name"
          onChange={(event) => onChange({ ...input, businessName: event.target.value })}
          className={cn("field-underline w-[10rem] max-w-full")}
        />
        {/* Keep "in [city]." together so the full stop never wraps onto its own line */}
        <span className="inline-flex items-baseline gap-x-2 whitespace-nowrap">
          <span>in</span>
          <input
            aria-label="City"
            list="venn-cities"
            value={input.city}
            onChange={(event) => onChange({ ...input, city: event.target.value })}
            className={cn("field-underline w-[9rem] max-w-full")}
          />
          <datalist id="venn-cities">
            {cities.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <span aria-hidden="true">.</span>
        </span>
      </Phrase>

      <CrowdSection input={input} onChange={onChange} demo={demo} />
    </div>
  );
}

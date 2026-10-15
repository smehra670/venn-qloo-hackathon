import { BUSINESS_TYPES, type BusinessInput, type BusinessType } from "@shared/types";
import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";

const PLACEHOLDERS = ["Aesop", "Radiohead", "pilates", "natural wine", "Bandcamp", "bouldering"];

export function AnchorInput({
  anchors,
  onChange,
}: {
  anchors: string[];
  onChange: (anchors: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [shake, setShake] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setPlaceholderIndex((index) => (index + 1) % PLACEHOLDERS.length), 2400);
    return () => window.clearInterval(timer);
  }, []);

  const add = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (value.length < 2) {
      setMessage("Use at least two characters.");
      return;
    }
    if (value.length > 60) {
      setMessage("Keep each one under 60 characters.");
      return;
    }
    if (anchors.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setShake(true);
      window.setTimeout(() => setShake(false), 350);
      setMessage("That one is already there.");
      return;
    }
    if (anchors.length >= 6) {
      setMessage("Six is the maximum.");
      return;
    }
    setMessage("");
    onChange([...anchors, value]);
    setDraft("");
  };

  return (
    <div className={cn("w-full", shake && "shake")}>
      <div className="flex flex-wrap items-center gap-2">
        {anchors.map((anchor) => (
          <Chip
            key={anchor}
            onRemove={() => {
              onChange(anchors.filter((item) => item !== anchor));
              setMessage("");
            }}
          >
            {anchor}
          </Chip>
        ))}
      </div>
      {anchors.length < 6 ? (
        adding || anchors.length === 0 ? (
          <input
            autoFocus={adding}
            value={draft}
            aria-label="Something your customers love"
            placeholder={PLACEHOLDERS[placeholderIndex] ?? "Add another"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                add(draft);
              }
              if (event.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!text.includes(",")) return;
              event.preventDefault();
              for (const part of text.split(",")) add(part);
            }}
            onBlur={() => {
              if (draft.trim()) add(draft);
              setAdding(false);
            }}
            className="mt-2 min-h-11 w-full max-w-xs border-0 border-b-2 border-line bg-transparent text-base text-ink outline-none placeholder:text-ink-soft/60 focus:border-ink"
          />
        ) : (
          <button type="button" className="link-underline mt-2 min-h-11 text-sm text-ink-soft" onClick={() => setAdding(true)}>
            Add another
          </button>
        )
      ) : null}
      <p className="mt-2 text-sm text-ink-soft">Add up to six. Press Enter after each one.</p>
      {message ? <p className="mt-1 text-sm text-ink-soft">{message}</p> : null}
    </div>
  );
}

export function validationMessage(input: BusinessInput): string | null {
  if (input.businessType === "other" && (input.businessTypeCustom ?? "").trim().length < 2) {
    return "Describe your business in a few words.";
  }
  if (input.city.trim().length < 2) return "Enter a city.";
  if (input.anchors.length < 1) return "Add at least one thing your customers love.";
  if (input.businessName && input.businessName.length > 60) return "Keep the name under 60 characters.";
  return null;
}

function Phrase({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2 text-[1.1rem] leading-[1.7] text-ink md:text-[1.2rem]">{children}</div>;
}

export function SentenceForm({
  input,
  cities,
  onChange,
}: {
  input: BusinessInput;
  cities: string[];
  onChange: (input: BusinessInput) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
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
      </Phrase>

      <div className="flex flex-col gap-2">
        <p className="font-bold text-ink">My customers love</p>
        <AnchorInput anchors={input.anchors} onChange={(anchors) => onChange({ ...input, anchors })} />
      </div>
    </div>
  );
}

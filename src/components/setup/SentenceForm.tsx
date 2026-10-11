import { BUSINESS_TYPES, type BusinessInput, type BusinessType } from "@shared/types";
import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";

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
    <span className={`inline-flex max-w-full flex-wrap items-center gap-2 align-middle ${shake ? "shake" : ""}`}>
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
      {anchors.length < 6 ? (
        <input
          value={draft}
          aria-label="Something your customers love"
          placeholder={PLACEHOLDERS[placeholderIndex] ?? "a brand or interest"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
            if (event.key === "Backspace" && draft.length === 0) {
              const last = anchors.at(-1);
              if (last) onChange(anchors.slice(0, -1));
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
          }}
          className="min-w-28 bg-transparent font-serif text-[1.15rem] text-ink outline-none placeholder:text-ink-soft/70"
        />
      ) : null}
      {message ? <span className="basis-full text-sm text-ink-soft">{message}</span> : null}
    </span>
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

export function SentenceForm({
  input,
  cities,
  onChange,
}: {
  input: BusinessInput;
  cities: string[];
  onChange: (input: BusinessInput) => void;
}) {
  return (
    <p className="font-serif text-[clamp(1.45rem,3vw,2rem)] leading-relaxed text-ink">
      I run a{" "}
      <select
        aria-label="Business type"
        value={input.businessType}
        onChange={(event) => onChange({ ...input, businessType: event.target.value as BusinessType })}
        className="mx-1 rounded-full bg-paper-2 px-3 py-1 font-serif text-ink"
      >
        {BUSINESS_TYPES.map((type) => (
          <option key={type} value={type}>
            {BUSINESS_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      {input.businessType === "other" ? (
        <input
          aria-label="Custom business type"
          value={input.businessTypeCustom ?? ""}
          placeholder="flower shop"
          onChange={(event) => onChange({ ...input, businessTypeCustom: event.target.value })}
          className="mx-1 w-36 rounded-full bg-paper-2 px-3 py-1 font-serif outline-none"
        />
      ) : null}{" "}
      called{" "}
      <input
        aria-label="Business name"
        value={input.businessName ?? ""}
        placeholder="optional name"
        onChange={(event) => onChange({ ...input, businessName: event.target.value })}
        className="mx-1 w-40 rounded-full bg-paper-2 px-3 py-1 font-serif outline-none placeholder:text-ink-soft/70"
      />{" "}
      in{" "}
      <input
        aria-label="City"
        list="venn-cities"
        value={input.city}
        onChange={(event) => onChange({ ...input, city: event.target.value })}
        className="mx-1 w-36 rounded-full bg-paper-2 px-3 py-1 font-serif outline-none"
      />
      <datalist id="venn-cities">
        {cities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      . My customers love <AnchorInput anchors={input.anchors} onChange={(anchors) => onChange({ ...input, anchors })} />.
    </p>
  );
}

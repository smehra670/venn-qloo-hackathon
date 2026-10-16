import { BUSINESS_TYPES, type AiAnchorSuggestion, type AnchorResolution, type BusinessInput, type BusinessType, type TasteAnchor, type TasteAnchorCandidate } from "@shared/types";
import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { resolveAnchors } from "@/lib/api";
import { cn } from "@/lib/cn";

const PLACEHOLDERS = ["Aesop", "Radiohead", "pilates", "natural wine", "Bandcamp", "bouldering"];

interface ChipRow {
  typed: string;
  resolution?: AnchorResolution;
  selected?: TasteAnchor;
  keepAsNote?: boolean;
  loading: boolean;
  open: boolean;
}

function badgeLabel(row: ChipRow): string | null {
  if (row.loading) return "…";
  if (row.keepAsNote) return "Note";
  if (row.selected?.origin === "ai_suggested") return "Suggested";
  if (row.selected?.kind === "tag" || row.resolution?.status === "topic") return "Topic";
  if (row.selected?.kind === "entity") {
    const type = row.selected.type.replace(/_/g, " ");
    return type.charAt(0).toUpperCase() + type.slice(1);
  }
  if (row.resolution?.status === "too_broad") return "Too broad";
  if (row.resolution?.status === "ambiguous") return "Pick one";
  if (row.resolution?.status === "unresolved") return "No match";
  return null;
}

function syncInput(input: BusinessInput, chips: ChipRow[]): BusinessInput {
  const tasteAnchors = chips
    .map((chip) => chip.selected)
    .filter((item): item is TasteAnchor => Boolean(item));
  const anchorNotes = chips.filter((chip) => chip.keepAsNote).map((chip) => chip.typed);
  return {
    ...input,
    anchors: chips.map((chip) => chip.typed),
    tasteAnchors: tasteAnchors.length > 0 ? tasteAnchors : undefined,
    anchorNotes: anchorNotes.length > 0 ? anchorNotes : undefined,
  };
}

export function AnchorInput({
  input,
  onChange,
  demo,
}: {
  input: BusinessInput;
  onChange: (input: BusinessInput) => void;
  demo?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [shake, setShake] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [chips, setChips] = useState<ChipRow[]>(() =>
    input.anchors.map((typed) => ({
      typed,
      selected: input.tasteAnchors?.find((item) => item.name.toLowerCase() === typed.toLowerCase()),
      loading: false,
      open: false,
    })),
  );
  const [demoHintShown, setDemoHintShown] = useState(false);
  const resolveSeq = useRef(new Map<string, number>());
  const listId = useId();

  useEffect(() => {
    const timer = window.setInterval(() => setPlaceholderIndex((index) => (index + 1) % PLACEHOLDERS.length), 2400);
    return () => window.clearInterval(timer);
  }, []);

  // Keep chips in sync when parent replaces anchors (e.g. example fill).
  useEffect(() => {
    const incoming = input.anchors;
    const same =
      incoming.length === chips.length && incoming.every((item, index) => item === chips[index]?.typed);
    if (same) return;
    setChips(
      incoming.map((typed) => {
        const existing = chips.find((chip) => chip.typed === typed);
        if (existing) return existing;
        return {
          typed,
          selected: input.tasteAnchors?.find((item) => item.name.toLowerCase() === typed.toLowerCase()),
          loading: false,
          open: false,
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to parent anchor list changes
  }, [input.anchors.join("\0")]);

  const pushChips = (next: ChipRow[]) => {
    setChips(next);
    onChange(syncInput(input, next));
  };

  const resolveChip = async (typed: string) => {
    const seq = (resolveSeq.current.get(typed) ?? 0) + 1;
    resolveSeq.current.set(typed, seq);
    setChips((prev) => prev.map((chip) => (chip.typed === typed ? { ...chip, loading: true } : chip)));
    try {
      const [resolution] = await resolveAnchors([typed], {
        city: input.city,
        businessType: input.businessType,
        goal: input.goals?.wants?.[0],
      });
      if (resolveSeq.current.get(typed) !== seq) return;
      setChips((prev) => {
        const next = prev.map((chip) => {
          if (chip.typed !== typed) return chip;
          const selected =
            resolution?.status === "entity" || resolution?.status === "topic"
              ? resolution.selected
              : undefined;
          // Topic + ambiguous always open so the user can confirm or switch; broad/unresolved open until resolved.
          const open =
            resolution?.status === "ambiguous" ||
            resolution?.status === "topic" ||
            ((resolution?.status === "too_broad" || resolution?.status === "unresolved") && !selected);
          return {
            ...chip,
            loading: false,
            resolution,
            selected: selected ?? chip.selected,
            open: Boolean(open),
          };
        });
        onChange(syncInput(input, next));
        return next;
      });
      if (demo && !demoHintShown) setDemoHintShown(true);
    } catch {
      if (resolveSeq.current.get(typed) !== seq) return;
      setChips((prev) => prev.map((chip) => (chip.typed === typed ? { ...chip, loading: false, open: true } : chip)));
    }
  };

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
    if (chips.some((item) => item.typed.toLowerCase() === value.toLowerCase())) {
      setShake(true);
      window.setTimeout(() => setShake(false), 350);
      setMessage("That one is already there.");
      return;
    }
    if (chips.length >= 6) {
      setMessage("Six is the maximum.");
      return;
    }
    setMessage("");
    const next = [...chips, { typed: value, loading: true, open: false }];
    pushChips(next);
    setDraft("");
    void resolveChip(value);
  };

  const remove = (typed: string) => {
    pushChips(chips.filter((chip) => chip.typed !== typed));
    setMessage("");
  };

  const pickCandidate = (typed: string, candidate: TasteAnchorCandidate) => {
    const selected: TasteAnchor = {
      name: candidate.name,
      kind: candidate.kind,
      id: candidate.id,
      type: candidate.type,
      origin: "user",
    };
    pushChips(
      chips.map((chip) =>
        chip.typed === typed ? { ...chip, selected, keepAsNote: false, open: false } : chip,
      ),
    );
  };

  const pickSuggestion = (typed: string, suggestion: AiAnchorSuggestion) => {
    if (!suggestion.verified) return;
    pushChips(
      chips.map((chip) =>
        chip.typed === typed
          ? {
              ...chip,
              selected: { ...suggestion.verified!, origin: "ai_suggested" },
              keepAsNote: false,
              open: false,
              typed: suggestion.verified!.name,
            }
          : chip,
      ),
    );
  };

  const leaveOut = (typed: string) => remove(typed);

  const keepAsNote = (typed: string) => {
    pushChips(
      chips.map((chip) =>
        chip.typed === typed ? { ...chip, selected: undefined, keepAsNote: true, open: false } : chip,
      ),
    );
  };

  return (
    <div className={cn("w-full", shake && "shake")}>
      <div className="flex flex-wrap items-start gap-2" id={listId}>
        {chips.map((chip) => {
          const badge = badgeLabel(chip);
          return (
            <div key={chip.typed} className="relative">
              <button
                type="button"
                className={cn(
                  "inline-flex min-h-9 max-w-[16rem] items-center gap-1.5 rounded-[12px] border border-line bg-paper px-3 py-1.5 text-sm text-ink",
                  chip.open && "border-ink",
                  (chip.resolution?.status === "too_broad" || chip.resolution?.status === "unresolved") &&
                    !chip.selected &&
                    !chip.keepAsNote &&
                    "text-ink-soft",
                )}
                onClick={() =>
                  pushChips(chips.map((row) => (row.typed === chip.typed ? { ...row, open: !row.open } : { ...row, open: false })))
                }
                aria-expanded={chip.open}
                aria-haspopup="dialog"
              >
                <span className="truncate">{chip.selected?.name ?? chip.typed}</span>
                {badge ? (
                  <span className="shrink-0 rounded bg-paper px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
                    {badge}
                  </span>
                ) : null}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${chip.typed}`}
                  className="rounded p-0.5 text-ink-soft hover:text-ink"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(chip.typed);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      remove(chip.typed);
                    }
                  }}
                >
                  ×
                </span>
              </button>
              {chip.open && chip.resolution ? (
                <div className="absolute left-0 z-20 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-[14px] border border-line bg-paper p-3 shadow-sm">
                  {chip.resolution.note ? (
                    <p className="mb-2 text-xs text-ink-soft">{chip.resolution.note}</p>
                  ) : chip.resolution.status === "too_broad" ? (
                    <p className="mb-2 text-xs text-ink-soft">Too broad. Pick a more specific topic or name.</p>
                  ) : chip.resolution.status === "unresolved" ? (
                    <p className="mb-2 text-xs text-ink-soft">No close match. Try a suggestion, leave it out, or keep as a note.</p>
                  ) : null}

                  {chip.resolution.entityCandidates.length > 0 ? (
                    <div className="mb-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Names</p>
                      <div className="flex flex-wrap gap-1.5">
                        {chip.resolution.entityCandidates.slice(0, 4).map((candidate) => (
                          <Chip
                            key={candidate.id}
                            pressed={chip.selected?.id === candidate.id}
                            onClick={() => pickCandidate(chip.typed, candidate)}
                          >
                            {candidate.name}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {chip.resolution.topicCandidates.length > 0 ? (
                    <div className="mb-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Topics</p>
                      <div className="flex flex-wrap gap-1.5">
                        {chip.resolution.topicCandidates.slice(0, 4).map((candidate) => (
                          <Chip
                            key={candidate.id}
                            pressed={chip.selected?.id === candidate.id}
                            onClick={() => pickCandidate(chip.typed, candidate)}
                          >
                            {candidate.name}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(chip.resolution.aiSuggestions?.length ?? 0) > 0 ? (
                    <div className="mb-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Suggested</p>
                      <div className="flex flex-wrap gap-1.5">
                        {chip.resolution.aiSuggestions!.map((suggestion) => (
                          <button
                            key={suggestion.query}
                            type="button"
                            title={suggestion.why}
                            className="rounded-[12px] border border-dashed border-line bg-surface px-3 py-1.5 text-sm text-ink"
                            onClick={() => pickSuggestion(chip.typed, suggestion)}
                          >
                            {suggestion.verified?.name ?? suggestion.query}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-2">
                    <button type="button" className="text-xs text-ink-soft underline" onClick={() => leaveOut(chip.typed)}>
                      Leave out
                    </button>
                    <button type="button" className="text-xs text-ink-soft underline" onClick={() => keepAsNote(chip.typed)}>
                      Keep as a note
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {chips.length < 6 ? (
        adding || chips.length === 0 ? (
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
      <p className="mt-2 text-sm text-ink-soft">Add up to six. Press Enter after each one — Venn matches names and topics as you go.</p>
      {demo && demoHintShown ? (
        <p className="mt-1 text-sm text-ink-soft">Demo mode only knows a few brands. Switch to live Qloo or pick an example.</p>
      ) : null}
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
  const hasTaste = (input.tasteAnchors?.length ?? 0) > 0;
  const onlyNotes =
    input.anchors.length > 0 &&
    (input.anchorNotes?.length ?? 0) >= input.anchors.length &&
    !hasTaste;
  if (onlyNotes) return "Pick at least one matched name or topic to rank partners.";
  return null;
}

function Phrase({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2 text-[1.1rem] leading-[1.7] text-ink md:text-[1.2rem]">{children}</div>;
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
        <AnchorInput input={input} onChange={onChange} demo={demo} />
      </div>
    </div>
  );
}

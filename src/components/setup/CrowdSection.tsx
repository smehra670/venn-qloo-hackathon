import type { AnchorResolution, BusinessInput, TasteAnchor } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { resolveAnchors } from "@/lib/api";
import { cn } from "@/lib/cn";
import { KindIcon, kindOfAnchor } from "@/components/setup/swipe/swipeUi";
import { MAX_ANCHORS, useSwipe } from "@/store/useSwipe";

interface ChipRow {
  typed: string;
  resolution?: AnchorResolution;
  selected?: TasteAnchor;
  keepAsNote?: boolean;
  loading: boolean;
}

/** Applies the backend's pick, or the best-scoring candidate when it was ambiguous. Null = keep as a note. */
function autoSelect(resolution?: AnchorResolution): TasteAnchor | undefined {
  if (!resolution) return undefined;
  if ((resolution.status === "entity" || resolution.status === "topic") && resolution.selected) {
    return resolution.selected;
  }
  if (resolution.status !== "ambiguous") return undefined;
  // Highest score wins. On a tie, a capitalised name ("Aesop", "Patagonia") means the user meant
  // that brand/artist, so the entity wins; a lowercase word ("yoga", "climbing") means the topic.
  // Qloo largely ignores topic tags as signals for brands and places, so picking a topic for a
  // brand name silently throws the anchor away.
  const preferTag = resolution.input.trim() === resolution.input.trim().toLowerCase();
  const best = [...resolution.entityCandidates, ...resolution.topicCandidates].sort(
    (a, b) =>
      b.score - a.score ||
      (preferTag ? Number(b.kind === "tag") - Number(a.kind === "tag") : Number(b.kind === "entity") - Number(a.kind === "entity")),
  )[0];
  return best
    ? { name: best.name, kind: best.kind, id: best.id, type: best.type, origin: "user" }
    : undefined;
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

const findSelected = (input: BusinessInput, typed: string) =>
  input.tasteAnchors?.find((item) => item.name.toLowerCase() === typed.toLowerCase());

function SwipeGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="12" height="15" rx="3" transform="rotate(-8 9.5 12.5)" />
      <rect x="8.5" y="4" width="12" height="15" rx="3" transform="rotate(7 14.5 11.5)" fill="#14151A" />
    </svg>
  );
}

/**
 * "My customers love…": two paths (swipe, or type), one list of chips for both, one cap of six.
 * Typed chips go through the existing resolver unchanged; swiped chips arrive already confirmed
 * (exact Qloo id) through `input.tasteAnchors` with `via: "swipe"`.
 */
export function CrowdSection({
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
  const [chips, setChips] = useState<ChipRow[]>(() =>
    input.anchors.map((typed) => ({ typed, selected: findSelected(input, typed), loading: false })),
  );
  const [demoHintShown, setDemoHintShown] = useState(false);
  const resolveSeq = useRef(new Map<string, number>());
  const inputRef = useRef<HTMLInputElement>(null);

  const swipeMode = useSwipe((state) => state.mode);
  const openDeck = useSwipe((state) => state.open);
  const typedOpenFlag = useSwipe((state) => state.typedOpen);
  const focusTypedAt = useSwipe((state) => state.focusTypedAt);
  const openTyped = useSwipe((state) => state.openTyped);
  const landing = useSwipe((state) => state.landing);

  const count = chips.length;
  const full = count >= MAX_ANCHORS;
  const hasTyped = chips.some((chip) => chip.selected?.via !== "swipe");
  const typedOpen = typedOpenFlag || hasTyped;

  // Keep chips in sync when the parent replaces anchors (example fill, swipe Yes, Undo).
  useEffect(() => {
    const incoming = input.anchors;
    const same = incoming.length === chips.length && incoming.every((item, index) => item === chips[index]?.typed);
    if (same) return;
    setChips(
      incoming.map((typed) => {
        const existing = chips.find((chip) => chip.typed === typed);
        if (existing) return existing;
        return { typed, selected: findSelected(input, typed), loading: false };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to parent anchor list changes
  }, [input.anchors.join("\0")]);

  // "Type your crowd" from the fallback panel moves the cursor here.
  useEffect(() => {
    if (focusTypedAt) inputRef.current?.focus();
  }, [focusTypedAt]);

  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  const inputLatest = useRef(input);
  inputLatest.current = input;

  const pushChips = (next: ChipRow[]) => {
    chipsRef.current = next;
    setChips(next);
    onChange(syncInput(inputLatest.current, next));
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
      // Read the latest chips and input: swipes may have landed while this was resolving.
      const prev = chipsRef.current;
      const picked = autoSelect(resolution);
      const selected = picked ? { ...picked, via: picked.origin === "ai_suggested" ? ("ai" as const) : ("typed" as const) } : undefined;
      // A typed name that resolves to a Qloo id already on the list is a duplicate: drop it.
      if (selected && prev.some((chip) => chip.typed !== typed && chip.selected?.id === selected.id)) {
        pushChips(prev.filter((chip) => chip.typed !== typed));
        setMessage("That one is already there.");
        return;
      }
      pushChips(
        prev.map((chip) => {
          if (chip.typed !== typed) return chip;
          // No picker: the best Qloo match is applied silently; anything unmatched stays a typed note.
          return {
            ...chip,
            loading: false,
            resolution,
            selected: selected ?? chip.selected,
            keepAsNote: !selected && !chip.selected,
          };
        }),
      );
      if (demo && !demoHintShown) setDemoHintShown(true);
    } catch {
      if (resolveSeq.current.get(typed) !== seq) return;
      setChips((prev) => prev.map((chip) => (chip.typed === typed ? { ...chip, loading: false, keepAsNote: true } : chip)));
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
    const current = chipsRef.current;
    if (current.some((item) => item.typed.toLowerCase() === value.toLowerCase())) {
      setShake(true);
      window.setTimeout(() => setShake(false), 350);
      setMessage("That one is already there.");
      return;
    }
    if (current.length >= MAX_ANCHORS) {
      setMessage("Six is the maximum.");
      return;
    }
    setMessage("");
    pushChips([...current, { typed: value, loading: true }]);
    setDraft("");
    void resolveChip(value);
  };

  const remove = (typed: string) => {
    pushChips(chipsRef.current.filter((chip) => chip.typed !== typed));
    setMessage("");
  };

  const showTyped = () => {
    // Force the panel open synchronously so focus() lands on the input itself, not the button —
    // typing that starts right after the click would otherwise land during the async gap before
    // the input mounts and lose its first keystrokes.
    flushSync(() => openTyped());
    inputRef.current?.focus();
  };

  return (
    <section className={cn("sw-crowd", shake && "shake")} aria-labelledby="sw-crowd-title">
      <div className="sw-crowd-h">
        <h2 id="sw-crowd-title">My customers love…</h2>
        <span className="sw-count" aria-live="polite">
          {count} of {MAX_ANCHORS}
        </span>
      </div>

      <div className="sw-paths">
        <button
          id="sw-start"
          type="button"
          className="sw-btn is-swipe"
          disabled={full}
          aria-expanded={swipeMode !== "idle"}
          onClick={() => void openDeck()}
        >
          <SwipeGlyph />
          <span>{count ? "Swipe more" : "Swipe your crowd"}</span>
        </button>
        <button type="button" className="sw-alt" onClick={showTyped} aria-expanded={typedOpen} aria-controls="sw-typed">
          or type them
        </button>
      </div>

      {typedOpen ? (
        <div className="sw-typed" id="sw-typed">
          <div className="sw-tin">
            <input
              ref={inputRef}
              value={draft}
              disabled={full}
              aria-label="Type a taste"
              placeholder="A band, a brand, a place or a hobby"
              autoComplete="off"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  add(draft);
                }
                if (event.key === "Escape") setDraft("");
              }}
              onPaste={(event) => {
                const text = event.clipboardData.getData("text");
                if (!text.includes(",")) return;
                event.preventDefault();
                for (const part of text.split(",")) add(part);
              }}
            />
            <button type="button" className="sw-btn is-ghost" disabled={full} onClick={() => add(draft)}>
              Add
            </button>
          </div>
          <p className="sw-hint" style={{ margin: 0 }}>
            Press Enter after each one. Venn matches names and topics as you go.
          </p>
        </div>
      ) : null}

      <ul className="sw-chips" aria-label="Your crowd's tastes">
        {chips.length === 0 ? <li className="sw-empty">Your picks will appear here.</li> : null}
        {chips.map((chip) => {
          const name = chip.selected?.name ?? chip.typed;
          const kind = chip.selected ? kindOfAnchor(chip.selected) : "topic";
          const hidden = Boolean(chip.selected && landing.includes(chip.selected.id));
          return (
            <li
              key={chip.typed}
              className={cn("sw-chip", chip.keepAsNote && "is-note", hidden && "is-hidden")}
              data-anchor-id={chip.selected?.id}
            >
              <span className="sw-dot" aria-hidden="true" />
              <span className="sw-kg">
                <KindIcon kind={kind} />
              </span>
              <span className="sw-name">{name}</span>
              {chip.loading ? <span className="sw-st">Checking</span> : chip.keepAsNote ? <span className="sw-st">Note</span> : null}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => remove(chip.typed)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="sw-hint">
        {full ? "That is the maximum. Remove one to add another." : "Pick 3 or more for the best matches. Up to 6."}
      </p>
      {demo && demoHintShown ? <p className="sw-hint">Demo mode only knows a few brands. Switch to live Qloo or pick an example.</p> : null}
      {message ? <p className="sw-hint">{message}</p> : null}
    </section>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { anchorCount, MAX_ANCHORS, useSwipe } from "@/store/useSwipe";
import { useVenn } from "@/store/useVenn";
import { SwipeDeck } from "./SwipeDeck";
import { KIND_LABEL, KindIcon, kindOfAnchor, useSheetLayout, useStaticMotion } from "./swipeUi";

function Summary({ onFind }: { onFind: () => void }) {
  const input = useVenn((state) => state.input);
  const reason = useSwipe((state) => state.doneReason);
  const n = anchorCount(input);
  const exhausted = reason === "exhausted";
  const title = exhausted ? "That is all the cards for now." : n >= MAX_ANCHORS ? "That is a full crowd." : "That is your crowd.";
  const sub = exhausted
    ? n
      ? `You kept ${n}. You can type more, or go with these.`
      : "You did not pick any. You can type what your customers love instead."
    : `${n} ${n === 1 ? "taste" : "tastes"}. Venn will look for businesses whose customers love the same things.`;
  const anchors = input.anchors.map((name) => ({ name, anchor: input.tasteAnchors?.find((a) => a.name.toLowerCase() === name.toLowerCase()) }));
  return (
    <div className="sw-pane">
      <h2 className="sw-big" id="sw-done-title" tabIndex={-1}>
        {title}
      </h2>
      <p className="sw-sub">{sub}</p>
      {anchors.length ? (
        <ul className="sw-sum">
          {anchors.map(({ name, anchor }) => {
            const kind = anchor ? kindOfAnchor(anchor) : "topic";
            return (
              <li key={name}>
                <span className="sw-dot" aria-hidden="true" />
                <span className="sw-kg">
                  <KindIcon kind={kind} size={16} />
                </span>
                <span>{anchor?.name ?? name}</span>
                <small>{anchor ? KIND_LABEL[kind] : "Note"}</small>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="sw-acts">
        {n > 0 ? (
          <button type="button" className="sw-btn is-lg" onClick={onFind}>
            Find my partners
          </button>
        ) : null}
        {exhausted && n === 0 ? (
          <button
            type="button"
            className="sw-btn is-lg"
            onClick={() => {
              useSwipe.getState().close();
              useSwipe.getState().openTyped(true);
            }}
          >
            Type your crowd
          </button>
        ) : null}
        {!exhausted && n < MAX_ANCHORS ? (
          <button type="button" className="sw-btn is-ghost is-lg" onClick={() => void useSwipe.getState().open()}>
            Swipe more
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NoCards() {
  const city = useVenn((state) => state.input.city.trim());
  const reason = useSwipe((state) => state.noCardsReason);
  return (
    <div className="sw-pane">
      <h2 className="sw-big" id="sw-none-title" tabIndex={-1}>
        {reason === "city"
          ? `No swipe cards for ${city} yet.`
          : reason === "no_city"
            ? "Add a city first."
            : "Swipe cards are not available right now."}
      </h2>
      <p className="sw-sub">
        {reason === "city"
          ? `Cards are not available for ${city} right now. `
          : reason === "no_city"
            ? "Swipe cards need to know where to look. "
            : ""}
        You can still type what your customers love.
      </p>
      <div className="sw-art" aria-hidden="true">
        <svg width="150" height="90" viewBox="0 0 150 90">
          <circle cx="58" cy="45" r="36" fill="none" stroke="#C4C9D2" strokeWidth="2" strokeDasharray="4 5" />
          <circle cx="92" cy="45" r="36" fill="none" stroke="#C4C9D2" strokeWidth="2" strokeDasharray="4 5" />
        </svg>
      </div>
      <div className="sw-acts">
        <button
          type="button"
          className="sw-btn is-lg"
          onClick={() => {
            useSwipe.getState().close();
            useSwipe.getState().openTyped(true);
          }}
        >
          Type your crowd
        </button>
        <button type="button" className="sw-btn is-ghost is-lg" onClick={() => useSwipe.getState().close()}>
          Close
        </button>
      </div>
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

/**
 * The right-hand panel on Setup. Idle: the existing Example card (`children`). Otherwise the
 * deck, the summary or the fallback, in the Example card's spot on laptops and as a bottom sheet
 * (backdrop, scroll lock, focus trap) at tablet and phone widths.
 */
export function SwipePanel({ children, onFind }: { children: ReactNode; onFind: () => void }) {
  const mode = useSwipe((state) => state.mode);
  const live = useSwipe((state) => state.live);
  const close = useSwipe((state) => state.close);
  const sheet = useSheetLayout();
  const still = useStaticMotion();
  const panelRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const open = mode !== "idle";

  // Focus: into the deck when it opens, back to the Swipe button when it closes.
  useEffect(() => {
    if (open && !wasOpen.current && !still) {
      requestAnimationFrame(() => document.getElementById("sw-stage")?.focus({ preventScroll: true }));
    }
    // Only when focus was lost with the panel ("Type your crowd" moves it to the input instead).
    const active = document.activeElement;
    if (!open && wasOpen.current && (!active || active === document.body)) {
      document.getElementById("sw-start")?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open, still]);

  useEffect(() => {
    if (mode === "done") document.getElementById("sw-done-title")?.focus({ preventScroll: true });
    if (mode === "nocards") document.getElementById("sw-none-title")?.focus({ preventScroll: true });
    if (mode === "swiping" && !still && !document.activeElement?.closest(".sw-panel")) {
      document.getElementById("sw-stage")?.focus({ preventScroll: true });
    }
  }, [mode, still]);

  // Sheet: lock page scroll, trap focus, Escape closes.
  useEffect(() => {
    if (!open || !sheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mode !== "swiping") close();
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, sheet, mode, close]);

  // Escape also closes the summary and fallback on laptops (the deck handles its own keys).
  useEffect(() => {
    if (!open || sheet || mode === "swiping") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, sheet, mode, close]);

  return (
    <>
      {!open || sheet ? children : null}
      {open ? (
        <>
          {sheet ? <div className={cn("sw-backdrop", still && "sw-static")} onClick={close} aria-hidden="true" /> : null}
          <aside
            ref={panelRef}
            className={cn("sw-panel", sheet && "is-sheet", still && "sw-static")}
            aria-label="Swipe your crowd"
            role={sheet ? "dialog" : undefined}
            aria-modal={sheet ? true : undefined}
          >
            {mode === "loading" || mode === "swiping" ? <SwipeDeck still={still} sheet={sheet} onClose={close} /> : null}
            {mode === "done" ? (
              <Summary
                onFind={() => {
                  close();
                  onFind();
                }}
              />
            ) : null}
            {mode === "nocards" ? <NoCards /> : null}
          </aside>
        </>
      ) : null}
      <div className="sr-only" aria-live="polite" role="status">
        {live?.text}
      </div>
    </>
  );
}

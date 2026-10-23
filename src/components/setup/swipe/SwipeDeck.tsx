import type { SwipeCard } from "@shared/schemas";
import type { BusinessInput } from "@shared/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ENOUGH, MAX_ANCHORS, anchorCount, useSwipe } from "@/store/useSwipe";
import { useVenn } from "@/store/useVenn";
import { flyToChip } from "./flyToChip";
import { KIND_LABEL, KindIcon, Provenance, Watermark, businessNoun, nameSize } from "./swipeUi";
import { restTransform, useSwipeGesture, type DragEnd } from "./useSwipeGesture";

const FLIGHT_MS = 420;

function CardFace({ card, input, stamp }: { card: SwipeCard; input: BusinessInput; stamp?: 1 | -1 }) {
  return (
    <>
      <Watermark seed={card.name} />
      <span className="sw-kind">
        <KindIcon kind={card.kind} />
        <span>{KIND_LABEL[card.kind]}</span>
      </span>
      <h3 className={cn("sw-nm", nameSize(card.name))}>{card.name}</h3>
      <p className="sw-why">
        <Provenance card={card} input={input} />
      </p>
      <span className="sw-stamp is-yes" aria-hidden="true" style={stamp === 1 ? { opacity: 1 } : undefined}>
        Yes
      </span>
      <span className="sw-stamp is-no" aria-hidden="true" style={stamp === -1 ? { opacity: 1 } : undefined}>
        Not really
      </span>
    </>
  );
}

/** Six bars, "N of 6", and "That is enough" (from 3 to 5 tastes). */
export function SwipeProgress({ count, onEnough }: { count: number; onEnough: () => void }) {
  const [pop, setPop] = useState<number | null>(null);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) {
      setPop(count - 1);
      const timer = window.setTimeout(() => setPop(null), 320);
      last.current = count;
      return () => window.clearTimeout(timer);
    }
    last.current = count;
  }, [count]);
  return (
    <div className="sw-prog">
      {Array.from({ length: MAX_ANCHORS }, (_, i) => (
        <i key={i} className={cn(i < count && "is-on", i === pop && "is-pop")} aria-hidden="true" />
      ))}
      <span>
        {count} of {MAX_ANCHORS}
      </span>
      <button type="button" className="sw-enough" hidden={!(count >= ENOUGH && count < MAX_ANCHORS)} onClick={onEnough}>
        That is enough
      </button>
    </div>
  );
}

interface Leaving {
  card: SwipeCard;
  dir: 1 | -1;
  from: string;
  to: string;
}

export function SwipeDeck({ still, sheet, onClose }: { still: boolean; sheet: boolean; onClose: () => void }) {
  const input = useVenn((state) => state.input);
  const mode = useSwipe((state) => state.mode);
  const queue = useSwipe((state) => state.queue);
  const history = useSwipe((state) => state.history);
  const busy = useSwipe((state) => state.busy);
  // Before the cards arrive, the provider decides the honesty line (mock means sample cards).
  const sampleCards = useSwipe((state) => state.sample);
  const mockProvider = useVenn((state) => state.health?.provider === "mock");
  const sample = sampleCards || mockProvider;
  const toastMsg = useSwipe((state) => state.toast);
  const { decide, settle, undo, finish, setBusy, setLanding } = useSwipe.getState();

  const stageRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLElement>());
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const leavingRef = useRef<HTMLDivElement>(null);
  const [toastOn, setToastOn] = useState(false);
  const loading = mode === "loading";
  const visible = queue.slice(0, 3);
  const count = anchorCount(input);

  useEffect(() => {
    if (!toastMsg) return;
    setToastOn(true);
    const timer = window.setTimeout(() => setToastOn(false), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  // Fly the leaving card out once it is on screen at its release position.
  useLayoutEffect(() => {
    const el = leavingRef.current;
    if (!leaving || !el) return;
    const frame = requestAnimationFrame(() => {
      el.style.transform = leaving.to;
      el.style.opacity = "0";
    });
    return () => cancelAnimationFrame(frame);
  }, [leaving]);

  const commit = (dir: 1 | -1, drag?: DragEnd) => {
    const state = useSwipe.getState();
    const top = state.queue[0];
    if (!top || state.busy || state.mode !== "swiping") return;
    const el = cardEls.current.get(top.id);
    const rect = el?.getBoundingClientRect();
    const fly = dir === 1 && !still;
    if (fly) setLanding(top.anchor.id, true);
    const result = decide(dir);
    if (!result.ok || (dir === 1 && !result.added)) {
      if (fly) setLanding(top.anchor.id, false);
      if (!result.ok && el) gesture.springBack(el);
      if (result.ok) settle();
      return;
    }
    if (still) {
      settle();
      return;
    }
    setBusy(true);
    const x0 = drag?.x ?? 0;
    const y0 = (drag?.y ?? 0) * 0.35;
    const out = dir * ((stageRef.current?.clientWidth ?? 400) + 320);
    setLeaving({
      card: top,
      dir,
      from: drag ? `translate(${x0}px, ${y0}px) rotate(${x0 / 16}deg)` : restTransform(0),
      to: `translate(${x0 + out}px, ${y0 - 30}px) rotate(${dir * 22}deg)`,
    });
    if (result.added && rect) {
      const anchorId = result.added.id;
      window.requestAnimationFrame(() =>
        flyToChip({ name: top.name, from: rect, anchorId, sheet, onLand: () => setLanding(anchorId, false) }),
      );
    }
    window.setTimeout(() => {
      setLeaving(null);
      setBusy(false);
      settle();
    }, FLIGHT_MS + 10);
  };

  const gesture = useSwipeGesture({
    enabled: () => useSwipe.getState().mode === "swiping" && !useSwipe.getState().busy,
    still,
    getNext: () => {
      const next = useSwipe.getState().queue[1];
      return next ? (cardEls.current.get(next.id) ?? null) : null;
    },
    onCommit: commit,
  });

  // Keys: only while swiping and not typing in a field.
  useEffect(() => {
    if (mode !== "swiping") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        commit(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        commit(-1);
      } else if (event.key === "z" || event.key === "Z" || event.key === "Backspace") {
        event.preventDefault();
        undo();
      } else if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit reads live store state
  }, [mode, still, sheet]);

  const top = visible[0];

  return (
    <div className="sw-pane">
      <div className="sw-dh">
        <h2 id="sw-deck-title">Swipe your crowd</h2>
        <button type="button" className="sw-done-btn" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="sw-q">Would your {businessNoun(input)} customers love this?</p>
      <SwipeProgress count={count} onEnough={finish} />

      <div
        ref={stageRef}
        className={cn("sw-stage", loading && "is-skel")}
        tabIndex={0}
        role="group"
        aria-roledescription="stack of cards"
        aria-label="Taste cards. Press the right arrow for yes, the left arrow for not really, Z to undo."
        aria-busy={loading}
        id="sw-stage"
      >
        {loading
          ? [2, 1, 0].map((i) => <div key={`skel-${i}`} className="sw-card" style={{ transform: restTransform(i), zIndex: 10 - i }} aria-hidden="true" />)
          : [...visible].reverse().map((card) => {
              const i = visible.indexOf(card);
              return (
                <div
                  key={card.id}
                  ref={(el) => {
                    if (el) cardEls.current.set(card.id, el);
                    else cardEls.current.delete(card.id);
                  }}
                  className={cn("sw-card", !still && "is-fresh", i === 0 && "is-top")}
                  style={{ transform: restTransform(i), zIndex: 10 - i }}
                  aria-hidden={i === 0 ? undefined : true}
                  aria-label={i === 0 ? `${card.name}, ${KIND_LABEL[card.kind]}` : undefined}
                  role={i === 0 ? "group" : undefined}
                  {...(i === 0 ? { onPointerDown: gesture.onPointerDown, onPointerMove: gesture.onPointerMove, onPointerUp: gesture.onPointerUp, onPointerCancel: gesture.onPointerUp } : {})}
                >
                  <CardFace card={card} input={input} />
                </div>
              );
            })}
        {leaving ? (
          <div
            key={`leaving-${leaving.card.id}`}
            ref={leavingRef}
            className="sw-card is-leaving"
            style={{ transform: leaving.from, zIndex: 20 }}
            aria-hidden="true"
          >
            <CardFace card={leaving.card} input={input} stamp={leaving.dir} />
          </div>
        ) : null}
      </div>

      <div className={cn("sw-actions", loading && "is-dim")}>
        <button type="button" className="sw-rb is-no" aria-label="Not really, left arrow" disabled={loading || !top || busy} onClick={() => commit(-1)}>
          <i>
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </i>
          Not really
        </button>
        <button type="button" className="sw-rb is-undo" aria-label="Undo, Z key" disabled={loading || history.length === 0 || busy} onClick={undo}>
          <i>
            <svg viewBox="0 0 24 24">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </i>
          Undo
        </button>
        <button type="button" className="sw-rb is-yes" aria-label="Yes, they love it, right arrow" disabled={loading || !top || busy} onClick={() => commit(1)}>
          <i>
            <svg viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </i>
          Yes, they love it
        </button>
      </div>
      <p className={cn("sw-keys", loading && "is-dim")} aria-hidden="true">
        <kbd>←</kbd> not really &nbsp; <kbd>→</kbd> yes &nbsp; <kbd>Z</kbd> undo
      </p>
      <p className="sw-prov">
        <b>{sample ? "These are sample cards." : "Cards come from Qloo, a taste database."}</b> Only the tastes you keep are used. Nothing about your
        customers is sent.
      </p>
      <div className={cn("sw-toast", toastOn && "is-show")} role="status">
        {toastMsg?.text}
      </div>
    </div>
  );
}

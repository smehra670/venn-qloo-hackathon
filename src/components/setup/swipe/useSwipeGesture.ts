import { useRef } from "react";

export const COMMIT_PX = 110;
const FLICK_PX = 40;
const FLICK_SPEED = 0.6; // px per ms
const NEXT_FULL_PX = 160;
export const STACK_GAP = 15;
export const STACK_SHRINK = 0.055;

export const restTransform = (index: number) => `translateY(${index * STACK_GAP}px) scale(${1 - index * STACK_SHRINK})`;

export interface DragEnd {
  x: number;
  y: number;
}

/**
 * Pointer drag for the top card (pointer capture, `touch-action: none` on the card). Writes
 * transforms straight to the element and batches moves with requestAnimationFrame, so a drag
 * never re-renders React. Release past 110px, or a quick flick past 40px, commits.
 */
export function useSwipeGesture(opts: {
  enabled: () => boolean;
  still: boolean;
  /** The card behind the top one (it scales up and rises as the top card is dragged). */
  getNext: () => HTMLElement | null;
  onCommit: (dir: 1 | -1, drag: DragEnd) => void;
}) {
  const state = useRef<{ x0: number; y0: number; x: number; y: number; t0: number; id: number; el: HTMLElement; frame: number } | null>(null);

  const stamps = (el: HTMLElement, x: number) => {
    const p = Math.min(1, Math.abs(x) / COMMIT_PX);
    const yes = el.querySelector<HTMLElement>(".sw-stamp.is-yes");
    const no = el.querySelector<HTMLElement>(".sw-stamp.is-no");
    if (yes) yes.style.opacity = String(x > 0 ? p : 0);
    if (no) no.style.opacity = String(x < 0 ? p : 0);
  };

  const paint = () => {
    const s = state.current;
    if (!s) return;
    s.frame = 0;
    const rotate = opts.still ? 0 : s.x / 16;
    s.el.style.transform = `translate(${s.x}px, ${s.y * 0.35}px) rotate(${rotate}deg)`;
    stamps(s.el, s.x);
    const next = opts.getNext();
    if (next) {
      const k = Math.min(1, Math.abs(s.x) / NEXT_FULL_PX);
      next.style.transform = `translateY(${STACK_GAP - STACK_GAP * k}px) scale(${1 - STACK_SHRINK + STACK_SHRINK * k})`;
    }
  };

  const springBack = (el: HTMLElement) => {
    el.classList.remove("is-drag");
    el.style.transform = restTransform(0);
    stamps(el, 0);
    const next = opts.getNext();
    if (next) next.style.transform = restTransform(1);
  };

  return {
    springBack,
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (!opts.enabled() || state.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const el = event.currentTarget;
      state.current = { x0: event.clientX, y0: event.clientY, x: 0, y: 0, t0: performance.now(), id: event.pointerId, el, frame: 0 };
      el.classList.add("is-drag");
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best effort (e.g. synthetic events in tests).
      }
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const s = state.current;
      if (!s || event.pointerId !== s.id) return;
      s.x = event.clientX - s.x0;
      s.y = event.clientY - s.y0;
      if (!s.frame) s.frame = requestAnimationFrame(paint);
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const s = state.current;
      if (!s || event.pointerId !== s.id) return;
      state.current = null;
      if (s.frame) cancelAnimationFrame(s.frame);
      const speed = Math.abs(s.x) / Math.max(1, performance.now() - s.t0);
      const commit = Math.abs(s.x) > COMMIT_PX || (speed > FLICK_SPEED && Math.abs(s.x) > FLICK_PX);
      if (commit && opts.enabled()) {
        s.el.classList.remove("is-drag");
        opts.onCommit(s.x > 0 ? 1 : -1, { x: s.x, y: s.y });
      } else {
        springBack(s.el);
      }
    },
  };
}

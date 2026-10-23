import type { Partner } from "@shared/types";
import { createContext, useContext } from "react";
import { tasteLine, type Taste } from "@/lib/tastes";

/**
 * The Overview's second kind of focus: a pinned taste (next to the selected partner). Every
 * panel reads it from here so they all agree on members and numbers. Highlight precedence is
 * hovered partner, then pinned taste, then nothing.
 */
export interface TasteFocus {
  /** The tray: up to 6 tastes with 2+ members among the visible partners. */
  tastes: Taste[];
  /** The pinned taste, or null. */
  taste: Taste | null;
  /** Members of the pinned taste among the visible partners. */
  members: Set<string>;
  /** Pin or unpin from a press (tray pill or flow node); plays the demo pull unless still. */
  toggle: (id: string) => void;
  /** Pin without toggling (start of a drag). */
  pin: (id: string) => void;
  clear: () => void;
  /** Bumped when a press should play the demo pull on the orbit. */
  demoAt: number;
}

export const TasteFocusContext = createContext<TasteFocus>({
  tastes: [],
  taste: null,
  members: new Set(),
  toggle: () => {},
  pin: () => {},
  clear: () => {},
  demoAt: 0,
});

export const useTasteFocus = () => useContext(TasteFocusContext);

/**
 * How dim a partner's mark should be: a hovered partner wins (that partner full, the rest at the
 * panel's hover opacity), then the pinned taste (members full, the rest at `tasteDim`).
 */
export function partnerOpacity(
  id: string,
  opts: { hoverId: string | null; focus: TasteFocus; hoverDim: number; tasteDim: number },
): number {
  if (opts.hoverId) return opts.hoverId === id ? 1 : opts.hoverDim;
  if (opts.focus.taste) return opts.focus.members.has(id) ? 1 : opts.focus.taste ? opts.tasteDim : 1;
  return 1;
}

/** Extra tooltip line for a member of the pinned taste. */
export function tasteTipLine(focus: TasteFocus, partner: Partner): { className: "l"; text: string } | null {
  if (!focus.taste) return null;
  const text = tasteLine(focus.taste, partner);
  return text ? { className: "l", text } : null;
}

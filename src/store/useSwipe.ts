import type { CardsResponse, SwipeCard } from "@shared/schemas";
import type { BusinessInput, TasteAnchor } from "@shared/types";
import { create } from "zustand";
import { getRefillCards, getSwipeCards } from "@/lib/api";
import { useVenn } from "@/store/useVenn";

/**
 * Setup's "Swipe your crowd" deck. Only the deck lives here; anchors stay in the main store's
 * `input` (typed and swiped chips share one list and one cap of six), and only they persist.
 */

export const MAX_ANCHORS = 6;
export const ENOUGH = 3;
const REFILL_AT = 3;
const REFILL_TAKE = 3;

export type SwipeMode = "idle" | "loading" | "swiping" | "done" | "nocards";

export interface SwipeHistoryEntry {
  card: SwipeCard;
  dir: 1 | -1;
  /** This Yes triggered the refill (Undo removes the refill cards again). */
  refilled?: boolean;
}

export interface SwipeState {
  mode: SwipeMode;
  queue: SwipeCard[];
  history: SwipeHistoryEntry[];
  refilled: boolean;
  busy: boolean;
  /** Why the deck ended ("crowd": finished or 6 Yeses; "exhausted": ran out of cards). */
  doneReason: "crowd" | "exhausted";
  /** Which fallback copy to show in `nocards`. */
  noCardsReason: "city" | "no_city" | "generic";
  /** `${businessType}|${city}` the current deck was fetched for. */
  deckKey: string | null;
  /** The full fetched deck (plus refill cards), for "Swipe more" and refill `excludeIds`. */
  deck: SwipeCard[];
  /** Ids of the cards the refill added, so Undo can take them out again. */
  refillIds: string[];
  /** True when any card in this deck is a sample (mock) card: changes the honesty line. */
  sample: boolean;
  toast: { id: number; text: string } | null;
  live: { id: number; text: string } | null;
  /** Typed path: shown, and a nonce that asks the input to take focus. */
  typedOpen: boolean;
  focusTypedAt: number;
  /** Anchor ids whose chip stays hidden until the fly-in clone lands on it. */
  landing: string[];
  setLanding: (id: string, on: boolean) => void;
  open: () => Promise<void>;
  decide: (dir: 1 | -1) => { ok: boolean; added?: TasteAnchor };
  /** Called once a card has finished flying away: ends the deck at 6 Yeses or when empty. */
  settle: () => void;
  undo: () => void;
  finish: () => void;
  close: () => void;
  setBusy: (busy: boolean) => void;
  /** Business type or city changed: the cards no longer match. Closes and drops the deck. */
  invalidate: () => void;
  openTyped: (focus?: boolean) => void;
}

// ---------------------------------------------------------------- anchor helpers (pure)

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function anchorCount(input: BusinessInput): number {
  return input.anchors.length;
}

/** True when the card is already a chip (same Qloo id, or the same name typed). */
export function isChosen(input: BusinessInput, card: SwipeCard): boolean {
  return (
    (input.tasteAnchors ?? []).some((anchor) => anchor.id === card.anchor.id) ||
    input.anchors.some((name) => same(name, card.name))
  );
}

export function anchorFromCard(card: SwipeCard): TasteAnchor {
  return { name: card.name, kind: card.anchor.kind, id: card.anchor.id, type: card.anchor.type, origin: "user", via: "swipe" };
}

export type AddResult = { ok: true; input: BusinessInput; anchor: TasteAnchor } | { ok: false; reason: "full" | "duplicate" };

/** Adds a swiped Yes as a confirmed anchor (exact id, no resolver). */
export function addSwipedAnchor(input: BusinessInput, card: SwipeCard): AddResult {
  if (anchorCount(input) >= MAX_ANCHORS) return { ok: false, reason: "full" };
  if (isChosen(input, card)) return { ok: false, reason: "duplicate" };
  const anchor = anchorFromCard(card);
  return {
    ok: true,
    anchor,
    input: { ...input, anchors: [...input.anchors, card.name], tasteAnchors: [...(input.tasteAnchors ?? []), anchor] },
  };
}

export function removeAnchorById(input: BusinessInput, id: string): BusinessInput {
  const target = input.tasteAnchors?.find((anchor) => anchor.id === id);
  if (!target) return input;
  const tasteAnchors = input.tasteAnchors!.filter((anchor) => anchor.id !== id);
  return {
    ...input,
    anchors: input.anchors.filter((name) => !same(name, target.name)),
    tasteAnchors: tasteAnchors.length ? tasteAnchors : undefined,
  };
}

const swipedIds = (input: BusinessInput) => (input.tasteAnchors ?? []).filter((a) => a.via === "swipe").map((a) => a.id);
const keyFor = (input: BusinessInput) => `${input.businessType}|${input.city.trim().toLowerCase()}`;

// ---------------------------------------------------------------- store

let seq = 0;
/** Bumped on close/invalidate/undo so a late fetch or refill cannot land in a stale deck. */
let token = 0;
let controller: AbortController | null = null;

export const useSwipe = create<SwipeState>((set, get) => {
  const venn = () => useVenn.getState();
  const say = (text: string) => set({ live: { id: ++seq, text } });
  const toast = (text: string) => set({ toast: { id: ++seq, text } });

  const startSwiping = (cards: SwipeCard[], extra: Partial<SwipeState> = {}) => {
    const queue = cards.filter((card) => !isChosen(venn().input, card));
    set({ history: [], refilled: false, refillIds: [], busy: false, queue, ...extra });
    if (queue.length) set({ mode: "swiping" });
    else set({ mode: "done", doneReason: "exhausted" });
  };

  const refill = async () => {
    const mine = token;
    const { input } = venn();
    const likedIds = swipedIds(input).slice(0, MAX_ANCHORS);
    if (!likedIds.length) return;
    try {
      const res = await getRefillCards({
        businessType: input.businessType,
        city: input.city.trim(),
        likedIds,
        excludeIds: get().deck.map((card) => card.id).slice(0, 40),
      });
      if (mine !== token || get().mode !== "swiping" || res.status !== "ok") return;
      const fresh = res.cards.filter((card) => !isChosen(venn().input, card) && !get().queue.some((q) => q.id === card.id)).slice(0, REFILL_TAKE);
      if (!fresh.length) return;
      const [top, ...rest] = get().queue;
      set({
        queue: top ? [top, ...fresh, ...rest] : fresh,
        deck: [...get().deck, ...fresh],
        refillIds: fresh.map((card) => card.id),
      });
      toast("Deck updated from your picks");
    } catch {
      // A failed refill is invisible: the person carries on with the remaining cards.
    }
  };

  return {
    mode: "idle",
    queue: [],
    history: [],
    refilled: false,
    busy: false,
    doneReason: "crowd",
    noCardsReason: "generic",
    deckKey: null,
    deck: [],
    refillIds: [],
    sample: false,
    toast: null,
    live: null,
    typedOpen: false,
    focusTypedAt: 0,
    landing: [],

    setLanding(id, on) {
      const rest = get().landing.filter((item) => item !== id);
      set({ landing: on ? [...rest, id] : rest });
    },

    async open() {
      const { input } = venn();
      if (anchorCount(input) >= MAX_ANCHORS) return;
      // A city under 2 characters fails CardsRequest's own schema and would otherwise throw
      // inside getSwipeCards, landing on the generic "not available" message instead of telling
      // the person what actually went wrong.
      if (input.city.trim().length < 2) {
        set({ mode: "nocards", noCardsReason: "no_city" });
        return;
      }
      const key = keyFor(input);
      const state = get();
      // Same business type and city: reuse what is left of the deck instead of refetching.
      if (state.deckKey === key && state.deck.length) {
        const remaining = state.queue.filter((card) => !isChosen(input, card));
        startSwiping(remaining.length ? remaining : state.deck);
        return;
      }
      const mine = ++token;
      controller?.abort();
      controller = new AbortController();
      set({ mode: "loading", queue: [], history: [], deck: [], deckKey: null, busy: false });
      let res: CardsResponse;
      try {
        res = await getSwipeCards({ businessType: input.businessType, city: input.city.trim() }, controller.signal);
      } catch {
        if (mine === token) set({ mode: "nocards", noCardsReason: "generic" });
        return;
      }
      if (mine !== token) return;
      if (res.status !== "ok" || !res.cards.length) {
        set({ mode: "nocards", noCardsReason: res.status === "unsupported_city" ? "city" : "generic" });
        return;
      }
      startSwiping(res.cards, { deck: res.cards, deckKey: key, sample: res.cards.some((card) => card.provenance === "sample") });
    },

    decide(dir) {
      const state = get();
      const card = state.queue[0];
      if (state.mode !== "swiping" || state.busy || !card) return { ok: false };
      if (dir === 1) {
        const result = addSwipedAnchor(venn().input, card);
        if (!result.ok && result.reason === "full") {
          toast("That is 6 already. Remove one first.");
          return { ok: false };
        }
        if (!result.ok) {
          // Already a chip (typed with the same id or name): skip the card quietly.
          set({ queue: state.queue.slice(1) });
          return { ok: true };
        }
        venn().setInput(result.input);
        const yeses = state.history.filter((entry) => entry.dir === 1).length + 1;
        const triggers = yeses >= REFILL_AT && !state.refilled;
        set({ queue: state.queue.slice(1), history: [...state.history, { card, dir, refilled: triggers }], refilled: state.refilled || triggers });
        say(`Added ${card.name}. ${anchorCount(result.input)} of ${MAX_ANCHORS}.`);
        if (triggers) void refill();
        return { ok: true, added: result.anchor };
      }
      set({ queue: state.queue.slice(1), history: [...state.history, { card, dir }] });
      say(`Skipped ${card.name}.`);
      return { ok: true };
    },

    settle() {
      const state = get();
      if (state.mode !== "swiping") return;
      if (anchorCount(venn().input) >= MAX_ANCHORS) get().finish();
      else if (!state.queue.length) {
        set({ mode: "done", doneReason: "exhausted" });
      }
    },

    undo() {
      const state = get();
      const last = state.history[state.history.length - 1];
      if (state.mode !== "swiping" || state.busy || !last) return;
      let queue = state.queue;
      let extra: Partial<SwipeState> = {};
      if (last.refilled) {
        token += 1; // a refill still in flight must not land after this Undo
        const drop = new Set(state.refillIds);
        queue = queue.filter((card) => !drop.has(card.id));
        extra = { refilled: false, refillIds: [], deck: state.deck.filter((card) => !drop.has(card.id)) };
      }
      if (last.dir === 1) venn().setInput(removeAnchorById(venn().input, last.card.anchor.id));
      set({ queue: [last.card, ...queue], history: state.history.slice(0, -1), ...extra });
      say(`Undid ${last.card.name}.`);
    },

    finish() {
      const n = anchorCount(venn().input);
      set({ mode: "done", doneReason: "crowd", busy: false });
      say(`Your crowd has ${n} ${n === 1 ? "taste" : "tastes"}.`);
    },

    close() {
      token += 1;
      controller?.abort();
      set({ mode: "idle", busy: false });
    },

    setBusy(busy) {
      set({ busy });
    },

    invalidate() {
      token += 1;
      controller?.abort();
      set({ mode: "idle", busy: false, queue: [], deck: [], deckKey: null, history: [], refilled: false, refillIds: [] });
    },

    openTyped(focus = false) {
      set({ typedOpen: true, ...(focus ? { focusTypedAt: ++seq } : {}) });
    },
  };
});

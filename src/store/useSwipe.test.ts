import type { CardKind, SwipeCard } from "@shared/schemas";
import type { BusinessInput } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getSwipeCards: vi.fn(), getRefillCards: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

const { addSwipedAnchor, removeAnchorById, useSwipe } = await import("./useSwipe");
const { useVenn } = await import("./useVenn");

function card(name: string, kind: CardKind = "brand"): SwipeCard {
  const id = `id-${name.toLowerCase().replace(/\s+/g, "-")}`;
  return { id, name, kind, provenance: "qloo_seed", anchor: { kind: kind === "topic" ? "tag" : "entity", id, type: `urn:entity:${kind}` } };
}
const DECK = ["Aesop", "Joy Division", "Oatly", "Radiohead", "Muji", "Bon Iver", "Patagonia", "Little Simz", "Kinfolk", "Khruangbin"].map((n, i) =>
  card(n, i % 2 ? "artist" : "brand"),
);
const empty: BusinessInput = { businessType: "cafe", city: "London", anchors: [] };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function openDeck(input: BusinessInput = empty) {
  useVenn.getState().setInput(input);
  await useSwipe.getState().open();
}

beforeEach(() => {
  api.getSwipeCards.mockReset().mockResolvedValue({ status: "ok", cards: DECK });
  api.getRefillCards.mockReset().mockResolvedValue({ status: "ok", cards: [card("New Order", "artist"), card("Factory Records"), card("Specialty coffee", "topic")] });
  useSwipe.getState().invalidate();
  useSwipe.setState({ typedOpen: false, toast: null, live: null, sample: false });
  useVenn.getState().setInput(empty);
});

describe("anchor helpers", () => {
  it("adds a verified anchor with the exact id, origin user and via swipe", () => {
    const result = addSwipedAnchor(empty, DECK[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.anchors).toEqual(["Aesop"]);
    expect(result.input.tasteAnchors).toEqual([{ name: "Aesop", kind: "entity", id: "id-aesop", type: "urn:entity:brand", origin: "user", via: "swipe" }]);
    expect(removeAnchorById(result.input, "id-aesop")).toMatchObject({ anchors: [], tasteAnchors: undefined });
  });

  it("caps at 6 across typed and swiped, and ignores duplicates by id or name", () => {
    const typed: BusinessInput = { ...empty, anchors: ["a1", "a2", "a3", "a4", "a5", "a6"] };
    expect(addSwipedAnchor(typed, DECK[0]!)).toEqual({ ok: false, reason: "full" });
    const sameId: BusinessInput = { ...empty, anchors: ["aesop brand"], tasteAnchors: [{ name: "aesop brand", kind: "entity", id: "id-aesop", type: "x", origin: "user", via: "typed" }] };
    expect(addSwipedAnchor(sameId, DECK[0]!)).toEqual({ ok: false, reason: "duplicate" });
    expect(addSwipedAnchor({ ...empty, anchors: ["aesop"] }, DECK[0]!)).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("swipe store", () => {
  it("opens to swiping and drops cards that are already chips", async () => {
    await openDeck({ ...empty, anchors: ["Oatly"] });
    const state = useSwipe.getState();
    expect(state.mode).toBe("swiping");
    expect(state.queue.some((c) => c.name === "Oatly")).toBe(false);
  });

  it("Yes adds a chip, Not really skips, and both announce", async () => {
    await openDeck();
    useSwipe.getState().decide(1);
    expect(useVenn.getState().input.anchors).toEqual(["Aesop"]);
    expect(useSwipe.getState().live?.text).toBe("Added Aesop. 1 of 6.");
    useSwipe.getState().decide(-1);
    expect(useVenn.getState().input.anchors).toEqual(["Aesop"]);
    expect(useSwipe.getState().live?.text).toBe("Skipped Joy Division.");
  });

  it("refills once at the third Yes, after the top card, and never again", async () => {
    await openDeck();
    for (let i = 0; i < 3; i += 1) useSwipe.getState().decide(1);
    await flush();
    expect(api.getRefillCards).toHaveBeenCalledTimes(1);
    const req = api.getRefillCards.mock.calls[0]![0];
    expect(req.likedIds).toEqual(["id-aesop", "id-joy-division", "id-oatly"]);
    expect(req.excludeIds).toEqual(DECK.map((c) => c.id));
    const queue = useSwipe.getState().queue.map((c) => c.name);
    expect(queue.slice(0, 4)).toEqual(["Radiohead", "New Order", "Factory Records", "Specialty coffee"]);
    expect(useSwipe.getState().toast?.text).toBe("Deck updated from your picks");
    useSwipe.getState().decide(1);
    await flush();
    expect(api.getRefillCards).toHaveBeenCalledTimes(1);
  });

  it("a failed refill is invisible", async () => {
    api.getRefillCards.mockRejectedValue(new Error("down"));
    await openDeck();
    for (let i = 0; i < 3; i += 1) useSwipe.getState().decide(1);
    await flush();
    expect(useSwipe.getState().mode).toBe("swiping");
    expect(useSwipe.getState().toast).toBeNull();
  });

  it("Undo reverses a Yes, and the refill it triggered", async () => {
    await openDeck();
    for (let i = 0; i < 3; i += 1) useSwipe.getState().decide(1);
    await flush();
    useSwipe.getState().undo();
    const state = useSwipe.getState();
    expect(useVenn.getState().input.anchors).toEqual(["Aesop", "Joy Division"]);
    expect(state.queue[0]!.name).toBe("Oatly");
    expect(state.queue.some((c) => c.name === "New Order")).toBe(false);
    expect(state.refilled).toBe(false);
    expect(state.live?.text).toBe("Undid Oatly.");
  });

  it("refuses a Yes at 6 with a toast and keeps the card", async () => {
    await openDeck({ ...empty, anchors: ["a1", "a2", "a3", "a4", "a5"] });
    useSwipe.getState().decide(1);
    const top = useSwipe.getState().queue[0]!.name;
    useSwipe.getState().decide(1);
    expect(useSwipe.getState().toast?.text).toBe("That is 6 already. Remove one first.");
    expect(useSwipe.getState().queue[0]!.name).toBe(top);
    useSwipe.getState().settle();
    expect(useSwipe.getState().mode).toBe("done");
  });

  it("ends as exhausted when the cards run out", async () => {
    api.getSwipeCards.mockResolvedValue({ status: "ok", cards: DECK.slice(0, 2) });
    await openDeck();
    useSwipe.getState().decide(-1);
    useSwipe.getState().decide(-1);
    useSwipe.getState().settle();
    expect(useSwipe.getState()).toMatchObject({ mode: "done", doneReason: "exhausted" });
  });

  it("goes to nocards with the right reason", async () => {
    api.getSwipeCards.mockResolvedValue({ status: "unsupported_city", cards: [] });
    await openDeck();
    expect(useSwipe.getState()).toMatchObject({ mode: "nocards", noCardsReason: "city" });
    useSwipe.getState().invalidate();
    api.getSwipeCards.mockRejectedValue(new Error("timeout"));
    await openDeck();
    expect(useSwipe.getState()).toMatchObject({ mode: "nocards", noCardsReason: "generic" });
  });

  it("closing keeps anchors and reuses the deck; changing city drops it", async () => {
    await openDeck();
    useSwipe.getState().decide(1);
    useSwipe.getState().close();
    expect(useSwipe.getState().mode).toBe("idle");
    expect(useVenn.getState().input.anchors).toEqual(["Aesop"]);
    await useSwipe.getState().open();
    expect(api.getSwipeCards).toHaveBeenCalledTimes(1);
    expect(useSwipe.getState().queue[0]!.name).toBe("Joy Division");
    useSwipe.getState().invalidate();
    expect(useSwipe.getState()).toMatchObject({ mode: "idle", deck: [], deckKey: null });
    expect(useVenn.getState().input.anchors).toEqual(["Aesop"]);
  });

  it("finish announces the crowd size", async () => {
    await openDeck();
    useSwipe.getState().decide(1);
    useSwipe.getState().finish();
    expect(useSwipe.getState().live?.text).toBe("Your crowd has 1 taste.");
  });
});

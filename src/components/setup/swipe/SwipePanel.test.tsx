// @vitest-environment jsdom
import type { CardKind, SwipeCard } from "@shared/schemas";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getSwipeCards: vi.fn(), getRefillCards: vi.fn(), resolveAnchors: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

const { CrowdSection } = await import("@/components/setup/CrowdSection");
const { SwipePanel } = await import("./SwipePanel");
const { useSwipe } = await import("@/store/useSwipe");
const { useVenn } = await import("@/store/useVenn");

let reduced = true;
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") ? reduced : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  if (!globalThis.CSS?.escape) (globalThis as { CSS?: unknown }).CSS = { escape: (value: string) => value.replace(/"/g, '\\"') };
});

function card(name: string, kind: CardKind = "brand"): SwipeCard {
  const id = `id-${name.toLowerCase().replace(/\s+/g, "-")}`;
  return { id, name, kind, provenance: "qloo_seed", anchor: { kind: kind === "topic" ? "tag" : "entity", id, type: `urn:entity:${kind}` } };
}
const DECK = ["Aesop", "Joy Division", "Barbican Centre", "Oatly", "Radiohead", "Muji", "Bon Iver", "Patagonia"].map((n, i) =>
  card(n, (["brand", "artist", "place"] as const)[i % 3]),
);

function Harness() {
  const input = useVenn((state) => state.input);
  return (
    <main>
      <h1>Setup</h1>
      <CrowdSection input={input} onChange={useVenn.getState().setInput} />
      <SwipePanel onFind={() => {}}>
        <p>Example: what you get</p>
      </SwipePanel>
    </main>
  );
}

async function openDeck() {
  render(<Harness />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Swipe your crowd" }));
  });
}
const key = (k: string) => act(() => void fireEvent.keyDown(document.body, { key: k }));
const chipNames = () => [...document.querySelectorAll(".sw-chip .sw-name")].map((el) => el.textContent);
const panel = () => document.querySelector<HTMLElement>(".sw-panel")!;
const live = () => document.querySelector('[role="status"][aria-live="polite"]')?.textContent;

async function axeViolations() {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

beforeEach(() => {
  reduced = true;
  api.getSwipeCards.mockReset().mockResolvedValue({ status: "ok", cards: DECK });
  api.getRefillCards.mockReset().mockResolvedValue({ status: "unavailable", cards: [] });
  useSwipe.getState().invalidate();
  useSwipe.setState({ typedOpen: false, toast: null, live: null, landing: [], sample: false });
  useVenn.getState().setInput({ businessType: "cafe", city: "London", anchors: [] });
});
afterEach(cleanup);

describe("Swipe your crowd", () => {
  it("idle shows two paths and the empty list, with no axe violations", async () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Swipe your crowd" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "or type them" })).toBeTruthy();
    expect(screen.getByText("Your picks will appear here.")).toBeTruthy();
    expect(screen.getByText("0 of 6")).toBeTruthy();
    expect(screen.getByText("Example: what you get")).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });

  it("keyboard: right is yes, left is not really, Z undoes, Escape closes", async () => {
    await openDeck();
    expect(screen.getByText("Would your café customers love this?")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Aesop, Brand" })).toBeTruthy();
    key("ArrowRight");
    expect(chipNames()).toEqual(["Aesop"]);
    expect(live()).toBe("Added Aesop. 1 of 6.");
    key("ArrowLeft");
    expect(live()).toBe("Skipped Joy Division.");
    key("z");
    expect(live()).toBe("Undid Joy Division.");
    expect(screen.getByRole("group", { name: "Joy Division, Artist" })).toBeTruthy();
    key("Escape");
    expect(document.querySelector(".sw-panel")).toBeNull();
    expect(chipNames()).toEqual(["Aesop"]);
    expect(screen.getByRole("button", { name: "Swipe more" })).toBeTruthy();
  });

  it("ignores keys while typing in a field", async () => {
    await openDeck();
    act(() => useSwipe.getState().openTyped());
    const field = screen.getByLabelText("Type a taste");
    act(() => void fireEvent.keyDown(field, { key: "ArrowRight" }));
    expect(chipNames()).toEqual([]);
  });

  it("buttons do the same as keys, Undo is disabled with no history", async () => {
    await openDeck();
    const undo = screen.getByRole("button", { name: "Undo, Z key" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Yes, they love it, right arrow" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Not really, left arrow" })));
    expect(chipNames()).toEqual(["Aesop"]);
    expect(undo.disabled).toBe(false);
  });

  it("shows That is enough from 3 tastes, and the summary after it", async () => {
    await openDeck();
    const enough = () => document.querySelector<HTMLButtonElement>(".sw-enough")!;
    key("ArrowRight");
    key("ArrowRight");
    expect(enough().hidden).toBe(true);
    key("ArrowRight");
    expect(enough().hidden).toBe(false);
    expect(await axeViolations()).toEqual([]);
    await act(async () => void fireEvent.click(enough()));
    expect(screen.getByRole("heading", { name: "That is your crowd." })).toBeTruthy();
    expect(screen.getByText("3 tastes. Venn will look for businesses whose customers love the same things.")).toBeTruthy();
    expect(within(panel()).getByRole("button", { name: "Swipe more" })).toBeTruthy();
    expect(live()).toBe("Your crowd has 3 tastes.");
    expect(await axeViolations()).toEqual([]);
  });

  it("finishes by itself at 6", async () => {
    await openDeck();
    for (let i = 0; i < 6; i += 1) key("ArrowRight");
    expect(screen.getByRole("heading", { name: "That is a full crowd." })).toBeTruthy();
    expect(within(panel()).queryByRole("button", { name: "Swipe more" })).toBeNull();
  });

  it("says when the cards run out", async () => {
    api.getSwipeCards.mockResolvedValue({ status: "ok", cards: DECK.slice(0, 2) });
    await openDeck();
    key("ArrowLeft");
    key("ArrowRight");
    expect(screen.getByRole("heading", { name: "That is all the cards for now." })).toBeTruthy();
    expect(screen.getByText("You kept 1. You can type more, or go with these.")).toBeTruthy();
  });

  it("nocards: says so, and Type your crowd moves the cursor to the typed input", async () => {
    api.getSwipeCards.mockResolvedValue({ status: "unsupported_city", cards: [] });
    await openDeck();
    expect(screen.getByRole("heading", { name: "No swipe cards for London yet." })).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Type your crowd" })));
    expect(document.activeElement).toBe(screen.getByLabelText("Type a taste"));
  });

  it("sample cards never say they came from Qloo", async () => {
    api.getSwipeCards.mockResolvedValue({ status: "ok", cards: DECK.map((c) => ({ ...c, provenance: "sample" as const })) });
    await openDeck();
    const top = screen.getByRole("group", { name: "Aesop, Brand" });
    expect(top.textContent).toContain("Not from Qloo");
    expect(top.textContent).not.toMatch(/Checked on Qloo|From Qloo/);
    expect(screen.getByText("These are sample cards.")).toBeTruthy();
  });

  it("reduced motion: the card swaps at once with no flying copy", async () => {
    await openDeck();
    key("ArrowRight");
    expect(document.querySelector(".sw-card.is-leaving")).toBeNull();
    expect(document.querySelector(".sw-flyer")).toBeNull();
    expect(document.querySelector(".sw-chip.is-hidden")).toBeNull();
  });

  it("with motion: the card flies out, then the deck settles", async () => {
    reduced = false;
    await openDeck();
    key("ArrowRight");
    expect(document.querySelector(".sw-card.is-leaving")).not.toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(document.querySelector(".sw-card.is-leaving")).toBeNull();
    expect(chipNames()).toEqual(["Aesop"]);
  });
});

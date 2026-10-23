// @vitest-environment jsdom
import type { Partner, RunResult } from "@shared/types";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let reduced = true;
// Installed before the panels load: they read matchMedia at import time.
{
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
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const { OrbitPanel } = await import("./OrbitPanel");
const { PicksPanel } = await import("./PicksPanel");
const { ScatterPanel } = await import("./ScatterPanel");
const { SankeyPanel } = await import("./SankeyPanel");
const { OverviewFilters } = await import("./OverviewFilters");
const { TasteFocusContext } = await import("./tasteFocus");
const { useOverviewTasteFocus } = await import("./useOverviewTasteFocus");
const { useVenn } = await import("@/store/useVenn");

function partner(id: string, name: string, score: number, sharedTags: string[]): Partner {
  return { id, name, kind: "music", matchScore: score, surprise: 0.3, local: false, sharedTags, tags: [], drivers: [] } as unknown as Partner;
}
const PARTNERS = [
  partner("p1", "Spin Cycle Records", 92, ["Vinyl and live music", "Slow mornings"]),
  partner("p2", "Lantern Vinyl Club", 88, ["Vinyl and live music"]),
  partner("p3", "Hearth Bakery", 84, ["Slow mornings", "Baking"]),
  partner("p4", "Quiet Hours Yoga", 70, ["Slow mornings"]),
  partner("p5", "Night Owl Records", 76, ["Vinyl and live music", "Baking"]),
];
const RESULT = { provider: "mock", providerLabel: "Demo data" } as RunResult;

let orbitRenders = 0;
function Harness() {
  const hoverId = useVenn((s) => s.hoverId);
  const selectedId = useVenn((s) => s.selectedId);
  const { focus, announce, everyTaste } = useOverviewTasteFocus(PARTNERS, RESULT);
  const common = { selectedId, hoverId, setHover: useVenn.getState().setHover, select: useVenn.getState().select };
  return (
    <TasteFocusContext.Provider value={focus}>
      <main>
        <h1>Overview</h1>
        <div role="status" aria-live="polite" className="sr-only">
          {announce}
        </div>
        <OverviewFilters partners={PARTNERS} kind="all" surprise={0} realistic={false} onKind={() => {}} onSurprise={() => {}} onRealistic={() => {}} />
        <Profiler id="orbit" onRender={() => (orbitRenders += 1)}>
          <OrbitPanel youName="Brew & Co" partners={PARTNERS} {...common} />
        </Profiler>
        <PicksPanel ranked={PARTNERS} surprise={0} {...common} />
        <ScatterPanel partners={PARTNERS} surprise={0} {...common} />
        <SankeyPanel anchors={["Aesop"]} partners={PARTNERS} allTastes={everyTaste} {...common} />
      </main>
    </TasteFocusContext.Provider>
  );
}

const pill = (name: RegExp) => screen.getByRole("button", { name: new RegExp(name.source + ".*, shared by") });
const live = () => document.querySelector('main > [role="status"]')?.textContent;
const orbitDot = (id: string) => document.querySelector<SVGGElement>(`#c-orbit .ov-pn[data-id="${id}"]`)!;

beforeEach(() => {
  reduced = true;
  orbitRenders = 0;
  act(() => useVenn.setState({ tasteId: null, hoverId: null, selectedId: "p1" }));
});
afterEach(cleanup);

describe("taste magnets", () => {
  it("shows a tray of tastes with 2+ members, strongest flow first", () => {
    render(<Harness />);
    const tray = screen.getByRole("group", { name: "Shared tastes" });
    const names = within(tray).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Vinyl and live music3", "Slow mornings3", "Baking2"]);
    expect(screen.getByRole("button", { name: /^Vinyl and live music, shared by 3 partners/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("pressing a pill pins it everywhere: chip, rings, dimming, flow node, live region", async () => {
    render(<Harness />);
    act(() => {
      fireEvent.pointerDown(pill(/^Slow mornings/), { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(pill(/^Slow mornings/), { pointerId: 1, clientX: 10, clientY: 10 });
    });
    expect(pill(/^Slow mornings/).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Taste: Slow mornings")).toBeTruthy();
    expect(live()).toBe("Slow mornings. 3 partners share it.");
    expect(screen.getByRole("heading", { name: "Slow mornings runs through 3 of your 5 partners" })).toBeTruthy();
    // orbit: members ringed, the rest at 16%
    expect(orbitDot("p1").classList.contains("tm")).toBe(true);
    expect(orbitDot("p2").style.opacity).toBe("0.16");
    // scatter: non-members dimmed
    expect(document.querySelector<SVGGElement>('.ov-qb[data-id="p2"]')!.style.opacity).toBe("0.16");
    // picks: non-member rows dimmed, members not
    expect(document.querySelector('.ov-pick[data-id="p2"]')!.classList.contains("ov-tm-off")).toBe(true);
    expect(document.querySelector('.ov-pick[data-id="p1"]')!.classList.contains("ov-tm-off")).toBe(false);
    // flow: the theme node is pressed
    const node = screen.getByRole("button", { name: /^Slow mornings, shared taste/ });
    expect(node.getAttribute("aria-pressed")).toBe("true");
    expect(await axeViolations()).toEqual([]);
  });

  it("hovering a partner wins over the pinned taste", () => {
    render(<Harness />);
    act(() => useVenn.setState({ tasteId: "slow-mornings" }));
    act(() => useVenn.getState().setHover("p2"));
    expect(orbitDot("p2").style.opacity).toBe("1");
    expect(orbitDot("p1").style.opacity).toBe("0.25");
    act(() => useVenn.getState().setHover(null));
    expect(orbitDot("p2").style.opacity).toBe("0.16");
  });

  it("selecting a partner keeps the taste", () => {
    render(<Harness />);
    act(() => useVenn.setState({ tasteId: "baking" }));
    act(() => useVenn.getState().select("p3"));
    expect(useVenn.getState().tasteId).toBe("baking");
  });

  it("Escape, the chip × and pressing again all clear it", () => {
    render(<Harness />);
    const press = (name: RegExp) =>
      act(() => {
        fireEvent.pointerDown(pill(name), { button: 0, pointerId: 1 });
        fireEvent.pointerUp(pill(name), { pointerId: 1 });
      });
    press(/^Baking/);
    act(() => void fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(useVenn.getState().tasteId).toBeNull();
    expect(live()).toBe("Taste focus cleared.");
    press(/^Baking/);
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Clear the taste focus" })));
    expect(useVenn.getState().tasteId).toBeNull();
    press(/^Baking/);
    press(/^Baking/);
    expect(useVenn.getState().tasteId).toBeNull();
  });

  it("keyboard: Enter and Space on a pill, Enter on a flow node", () => {
    render(<Harness />);
    act(() => void fireEvent.keyDown(pill(/^Baking/), { key: "Enter" }));
    expect(useVenn.getState().tasteId).toBe("baking");
    act(() => void fireEvent.keyDown(pill(/^Baking/), { key: " " }));
    expect(useVenn.getState().tasteId).toBeNull();
    act(() => void fireEvent.keyDown(screen.getByRole("button", { name: /^Vinyl and live music, shared taste/ }), { key: "Enter" }));
    expect(useVenn.getState().tasteId).toBe("vinyl-and-live-music");
    act(() => void fireEvent.click(screen.getByRole("button", { name: /^Vinyl and live music, shared taste/ })));
    expect(useVenn.getState().tasteId).toBeNull();
  });

  it("without strengths shows no percentages, and the orbit table gains the taste column", () => {
    render(<Harness />);
    act(() => useVenn.setState({ tasteId: "vinyl-and-live-music" }));
    const orbit = document.getElementById("c-orbit")!;
    act(() => void fireEvent.click(within(orbit).getByRole("button", { name: "Table" })));
    expect(within(orbit).getByRole("columnheader", { name: "In vinyl and live music" })).toBeTruthy();
    expect(within(orbit).getAllByText("Shares it")).toHaveLength(3);
    expect(document.getElementById("c-orbit")!.textContent).not.toMatch(/% of (their )?match/);
  });

  it("reduced motion: a press highlights only (no demo pull)", () => {
    render(<Harness />);
    act(() => {
      fireEvent.pointerDown(pill(/^Baking/), { button: 0, pointerId: 1 });
      fireEvent.pointerUp(pill(/^Baking/), { pointerId: 1 });
    });
    expect(document.querySelector("#c-orbit .ov-plot > svg")!.classList.contains("is-pulling")).toBe(false);
    expect(document.querySelector(".ov-magnet-glyph")!.getAttribute("opacity")).toBe("0");
  });

  it("with motion a press plays the demo pull", () => {
    reduced = false;
    render(<Harness />);
    act(() => {
      fireEvent.pointerDown(pill(/^Baking/), { button: 0, pointerId: 1 });
      fireEvent.pointerUp(pill(/^Baking/), { pointerId: 1 });
    });
    expect(document.querySelector("#c-orbit .ov-plot > svg")!.classList.contains("is-pulling")).toBe(true);
  });

  it("dragging the magnet does not re-render React per pointer move, and keeps the taste pinned", async () => {
    reduced = false;
    render(<Harness />);
    const target = pill(/^Vinyl and live music/);
    act(() => void fireEvent.pointerDown(target, { button: 0, pointerId: 7, clientX: 0, clientY: 0 }));
    act(() => void fireEvent.pointerMove(target, { pointerId: 7, clientX: 40, clientY: 40 }));
    expect(useVenn.getState().tasteId).toBe("vinyl-and-live-music");
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
    const before = orbitRenders;
    for (let i = 0; i < 25; i += 1) act(() => void fireEvent.pointerMove(target, { pointerId: 7, clientX: 60 + i * 8, clientY: 50 + i * 4 }));
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
    expect(orbitRenders).toBe(before);
    expect(document.querySelector(".ov-magnet-glyph")!.getAttribute("opacity")).toBe("1");
    act(() => void fireEvent.pointerUp(target, { pointerId: 7 }));
    expect(useVenn.getState().tasteId).toBe("vinyl-and-live-music");
    expect(document.querySelector(".ov-magnet-glyph")!.getAttribute("opacity")).toBe("0");
  });
});

async function axeViolations() {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

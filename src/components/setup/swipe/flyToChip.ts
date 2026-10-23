/**
 * The "fly to chip" clone: a pill starts at the card centre (scale 1.5, transparent), rises 26px
 * at 22% (scale 1.25, opaque), then lands on the real chip's rectangle over 720ms. When the chip
 * is not visible (phone sheet, or scrolled away) it flies 120px up and fades over 520ms instead.
 * `onLand` reveals the real chip.
 */
export function flyToChip(opts: { name: string; from: DOMRect; anchorId: string; sheet: boolean; onLand: () => void }): void {
  const target = document.querySelector<HTMLElement>(`.sw-chip[data-anchor-id="${CSS.escape(opts.anchorId)}"]`);
  const flyer = document.createElement("div");
  flyer.className = "sw-flyer";
  flyer.setAttribute("aria-hidden", "true");
  const dot = document.createElement("span");
  dot.className = "sw-dot";
  const label = document.createElement("span");
  label.textContent = opts.name;
  flyer.append(dot, label);
  document.body.appendChild(flyer);

  const width = flyer.offsetWidth;
  const height = flyer.offsetHeight;
  const sx = opts.from.left + opts.from.width / 2 - width / 2;
  const sy = opts.from.top + opts.from.height / 2 - height / 2;
  const rect = target?.getBoundingClientRect();
  const visible = Boolean(rect && !opts.sheet && rect.top > 0 && rect.bottom < window.innerHeight);
  if (!visible) opts.onLand();
  const ex = visible ? rect!.left : sx;
  const ey = visible ? rect!.top : sy - 120;

  if (typeof flyer.animate !== "function") {
    flyer.remove();
    if (visible) opts.onLand();
    return;
  }
  const animation = flyer.animate(
    [
      { transform: `translate(${sx}px, ${sy}px) scale(1.5)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy - 26}px) scale(1.25)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${ex}px, ${ey}px) scale(1)`, opacity: visible ? 1 : 0 },
    ],
    { duration: visible ? 720 : 520, easing: "cubic-bezier(.45,.05,.2,1)", fill: "forwards" },
  );
  const done = () => {
    flyer.remove();
    if (visible) opts.onLand();
  };
  animation.onfinish = done;
  animation.oncancel = done;
}

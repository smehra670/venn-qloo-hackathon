import { useEffect, useState } from "react";

export type TipLine = { className: "v" | "l" | "r"; text: string };

let showFn: ((lines: TipLine[], x: number, y: number) => void) | null = null;
let moveFn: ((x: number, y: number) => void) | null = null;
let hideFn: (() => void) | null = null;

export function tipShow(lines: TipLine[], x: number, y: number): void {
  showFn?.(lines, x, y);
}

export function tipMove(x: number, y: number): void {
  moveFn?.(x, y);
}

export function tipHide(): void {
  hideFn?.();
}

/** Fixed tooltip — content set via textContent only (never innerHTML). */
export function OverviewTipHost() {
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState<TipLine[]>([]);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    showFn = (next, x, y) => {
      setLines(next);
      setPos({ x, y });
      setVisible(true);
    };
    moveFn = (x, y) => setPos({ x, y });
    hideFn = () => setVisible(false);
    return () => {
      showFn = null;
      moveFn = null;
      hideFn = null;
    };
  }, []);

  const style = {
    opacity: visible ? 1 : 0,
    transform: `translate(${Math.max(8, pos.x + 14)}px, ${Math.max(8, pos.y + 14)}px)`,
  };

  return (
    <div className="ov-tip" role="tooltip" style={style} aria-hidden={!visible}>
      {lines.map((line, i) => (
        <div key={i} className={line.className}>
          {line.text}
        </div>
      ))}
    </div>
  );
}

export function bindPartnerPointer(
  id: string,
  opts: {
    setHover: (id: string | null) => void;
    select: (id: string | null) => void;
    lines: () => TipLine[];
  },
) {
  return {
    tabIndex: 0 as const,
    role: "button" as const,
    "data-id": id,
    onMouseEnter: (e: React.MouseEvent) => {
      opts.setHover(id);
      tipShow(opts.lines(), e.clientX, e.clientY);
    },
    onMouseMove: (e: React.MouseEvent) => tipMove(e.clientX, e.clientY),
    onMouseLeave: () => {
      opts.setHover(null);
      tipHide();
    },
    onFocus: (e: React.FocusEvent<Element>) => {
      opts.setHover(id);
      const r = e.currentTarget.getBoundingClientRect();
      tipShow(opts.lines(), r.left + r.width / 2, r.top + r.height / 2);
    },
    onBlur: () => {
      opts.setHover(null);
      tipHide();
    },
    onClick: () => opts.select(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        opts.select(id);
      }
    },
  };
}

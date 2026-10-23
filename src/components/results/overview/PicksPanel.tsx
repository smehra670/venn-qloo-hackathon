import type { Partner } from "@shared/types";
import { bindPartnerPointer, type TipLine } from "@/components/results/overview/OverviewTip";
import { useTasteFocus } from "@/components/results/overview/tasteFocus";
import { useReveal } from "@/components/results/overview/useReveal";
import { PARTNER_BLUE, kindLabel, REACH_LABEL, reachLevel } from "@/lib/overviewModel";
import { cn } from "@/lib/cn";

function tipLines(p: Partner): TipLine[] {
  return [
    { className: "v", text: `${Math.round(p.matchScore)} overlap` },
    { className: "l", text: `${p.name} · ${kindLabel(p.kind)}` },
    { className: "l", text: REACH_LABEL[reachLevel(p)] },
  ];
}

export function PicksPanel({
  ranked,
  surprise,
  selectedId,
  hoverId,
  setHover,
  select,
}: {
  ranked: Partner[];
  surprise: number;
  selectedId: string | null;
  hoverId: string | null;
  setHover: (id: string | null) => void;
  select: (id: string | null) => void;
}) {
  const focus = useTasteFocus();
  // A pinned taste dims (never moves or hides) the rows that do not share it.
  const off = (id: string) => Boolean(focus.taste) && !focus.members.has(id) && hoverId !== id;
  const top = ranked.slice(0, 3);
  const sub =
    surprise < 0.34
      ? "Safest fits first: strong overlap and an easy way in."
      : surprise > 0.66
        ? "Wildcards first: they still overlap with you, but less obviously."
        : "A mix of safe fits and pleasant surprises.";

  // Keep a stable list of up to 8 so rows can slide between ranks
  const pool = ranked.slice(0, 8);
  const more = ranked.slice(3, 8);
  const revealRef = useReveal<HTMLElement>();

  return (
    <article ref={revealRef} className="ov-card reveal" id="c-picks">
      <header className="ov-ch">
        <div>
          <h2>Start with these three</h2>
          <p className="ov-sub">{sub}</p>
        </div>
      </header>
      <div className="ov-picks">
        {pool.map((p) => {
          const i = top.findIndex((t) => t.id === p.id);
          const visible = i >= 0;
          const lvl = reachLevel(p);
          const bind = bindPartnerPointer(p.id, {
            setHover,
            select,
            lines: () => tipLines(p),
          });
          return (
            <div
              key={p.id}
              className={cn(
                "ov-pick",
                hoverId === p.id && "hl",
                selectedId === p.id && "sel",
                off(p.id) && "ov-tm-off",
              )}
              style={{
                transform: `translateY(calc(${visible ? i : 3} * var(--ov-pitch)))`,
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? "auto" : "none",
              }}
              {...bind}
              tabIndex={visible ? 0 : -1}
              aria-hidden={!visible}
              aria-label={p.name}
            >
              <div className="ov-rk">{visible ? i + 1 : ""}</div>
              <div style={{ minWidth: 0 }}>
                <div className="ov-nm">{p.name}</div>
                <div className="ov-mt">
                  <span>{kindLabel(p.kind)}</span>
                  <span className={cn("ov-lvl", lvl)}>{REACH_LABEL[lvl]}</span>
                  {p.surprise >= 0.6 && surprise > 0.35 ? (
                    <span className="ov-wc">Wildcard</span>
                  ) : null}
                </div>
              </div>
              <div className="ov-sc">
                {Math.round(p.matchScore)}
                <small>overlap</small>
              </div>
            </div>
          );
        })}
      </div>
      {more.length > 0 ? (
        <div className="ov-more">
          <h3>Also worth a look</h3>
          <ul>
            {more.map((p) => {
              const bind = bindPartnerPointer(p.id, {
                setHover,
                select,
                lines: () => tipLines(p),
              });
              return (
                <li key={p.id}>
                <div
                  className={cn("ov-more-row", hoverId === p.id && "hl", selectedId === p.id && "sel", off(p.id) && "ov-tm-off")}
                  aria-label={p.name}
                  {...bind}
                >
                  <i style={{ background: PARTNER_BLUE }} aria-hidden="true" />
                  <span className="nm">{p.name}</span>
                  <span className="kd">{kindLabel(p.kind)}</span>
                  <b>{Math.round(p.matchScore)}</b>
                </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

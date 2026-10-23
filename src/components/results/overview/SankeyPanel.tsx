import { useMemo } from "react";
import type { Partner } from "@shared/types";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { bindPartnerPointer, tipHide, tipMove, tipShow, type TipLine } from "@/components/results/overview/OverviewTip";
import { useTasteFocus } from "@/components/results/overview/tasteFocus";
import { kindLabel, score01 } from "@/lib/overviewModel";
import { tasteId, type Taste } from "@/lib/tastes";
import { cn } from "@/lib/cn";

const SK = { W: 820, H: 440, top: 44, bot: 12, gap: 12, nw: 14, x: [128, 372, 632] as const };
const NARROW =
  typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false;

type Node = {
  key: string;
  id: string;
  name: string;
  v: number;
  c: string;
  col: 0 | 1 | 2;
  x: number;
  y: number;
  h: number;
  partner?: Partner;
};

type Link = {
  s: string;
  t: string;
  w: number;
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  grad: "ska" | "skb";
};

function collectThemes(partners: Partner[]): string[] {
  const counts = new Map<string, number>();
  for (const p of partners) {
    for (const tag of p.sharedTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + score01(p));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([t]) => t);
}

export function SankeyPanel({
  anchors,
  partners,
  selectedId,
  hoverId,
  setHover,
  select,
  allTastes,
}: {
  anchors: string[];
  partners: Partner[];
  selectedId: string | null;
  hoverId: string | null;
  setHover: (id: string | null) => void;
  select: (id: string | null) => void;
  /** Every shared taste with its per-partner weights (`allTastes()` in src/lib/tastes.ts). */
  allTastes: Taste[];
}) {
  const focus = useTasteFocus();
  const tasteById = useMemo(() => new Map(allTastes.map((taste) => [taste.id, taste])), [allTastes]);
  const top = partners.slice(0, 6);
  const themes = useMemo(() => collectThemes(top), [top]);

  const model = useMemo(() => {
    if (themes.length === 0 || top.length === 0) return null;

    const themeWeight = new Map<string, number>();
    const themePartner: { t: string; p: string; v: number }[] = [];
    for (const p of top) {
      const tags = p.sharedTags.filter((t) => themes.includes(t));
      if (tags.length === 0) continue;
      for (const t of tags) {
        // Same numbers as the taste tray and tooltips: Qloo affinity share on live runs,
        // otherwise an equal split (membership only).
        const taste = tasteById.get(tasteId(t));
        const weight = taste?.hasStrength ? (taste.weights[p.id] ?? 0) : 1 / tags.length;
        const share = score01(p) * weight;
        themeWeight.set(t, (themeWeight.get(t) ?? 0) + share);
        themePartner.push({ t, p: p.id, v: share });
      }
    }
    if (themeWeight.size === 0) return null;

    const activeThemes = themes.filter((t) => (themeWeight.get(t) ?? 0) > 0);
    const anchorList = (anchors.length > 0 ? anchors : ["Your taste"]).slice(0, 3);
    const anchorTheme: { a: string; t: string; v: number }[] = [];
    for (let i = 0; i < anchorList.length; i++) {
      for (const t of activeThemes) {
        const w = themeWeight.get(t) ?? 0;
        // Spread theme weight across anchors (equal share; real explainability has no per-anchor split)
        anchorTheme.push({ a: `a${i}`, t, v: w / anchorList.length });
      }
    }

    const total = top.reduce((s, p) => s + score01(p), 0);
    const nmax = Math.max(activeThemes.length, top.length, anchorList.length, 2);
    const k = (SK.H - SK.top - SK.bot - (nmax - 1) * SK.gap) / Math.max(total, 0.01);

    const place = (items: Omit<Node, "x" | "y" | "h">[], xi: number): Node[] => {
      const hh = items.reduce((s, n) => s + n.v * k, 0) + (items.length - 1) * SK.gap;
      let y = SK.top + (SK.H - SK.top - SK.bot - hh) / 2;
      return items.map((n) => {
        const h = Math.max(n.v * k, 3);
        const node: Node = { ...n, x: SK.x[xi] ?? SK.x[0]!, y, h };
        y += h + SK.gap;
        return node;
      });
    };

    const A = place(
      anchorList.map((name, i) => ({
        key: `a:a${i}`,
        id: `a${i}`,
        name,
        v: anchorTheme.filter((x) => x.a === `a${i}`).reduce((s, x) => s + x.v, 0) || 0.1,
        c: "#FF6B57",
        col: 0 as const,
      })),
      0,
    );
    const T = place(
      activeThemes.map((t) => ({
        key: `t:${t}`,
        id: t,
        name: t,
        v: themeWeight.get(t) ?? 0.1,
        c: "#6B3FA0",
        col: 1 as const,
      })),
      1,
    );
    const P = place(
      top.map((p) => ({
        key: `p:${p.id}`,
        id: p.id,
        name: p.name,
        v: score01(p),
        c: "#4F5BFF",
        col: 2 as const,
        partner: p,
      })),
      2,
    );

    const nmap = new Map<string, Node & { outY: number; inY: number }>();
    for (const n of [...A, ...T, ...P]) {
      nmap.set(n.key, { ...n, outY: n.y, inY: n.y });
    }

    const links: Link[] = [];
    const pushLinks = (
      list: { sk: string; tk: string; v: number }[],
      grad: "ska" | "skb",
    ) => {
      const sorted = list.slice().sort((u, v) => {
        const ty = nmap.get(u.tk)?.y ?? 0;
        const ty2 = nmap.get(v.tk)?.y ?? 0;
        return ty - ty2;
      });
      for (const l of sorted) {
        const s = nmap.get(l.sk);
        const t = nmap.get(l.tk);
        if (!s || !t) continue;
        const w = Math.max(l.v * k, 1);
        const y0 = s.outY + w / 2;
        const y1 = t.inY + w / 2;
        s.outY += w;
        t.inY += w;
        links.push({
          s: s.key,
          t: t.key,
          w,
          y0,
          y1,
          x0: s.x + SK.nw,
          x1: t.x,
          grad,
        });
      }
    };

    pushLinks(
      anchorTheme.map((x) => ({ sk: `a:${x.a}`, tk: `t:${x.t}`, v: x.v })),
      "ska",
    );
    pushLinks(
      themePartner.map((x) => ({ sk: `t:${x.t}`, tk: `p:${x.p}`, v: x.v })),
      "skb",
    );

    const sortedThemes = activeThemes
      .slice()
      .sort((a, b) => (themeWeight.get(b) ?? 0) - (themeWeight.get(a) ?? 0));

    return { A, T, P, links, sortedThemes, themeWeight, themePartner, total };
  }, [anchors, themes, top, tasteById]);

  const links = model?.links ?? [];
  // Hover on a partner wins, then the pinned taste, then the selected partner.
  const focusedTheme = focus.taste ? themes.find((t) => tasteId(t) === focus.taste!.id) : undefined;
  const hlKey = hoverId ? `p:${hoverId}` : focus.taste ? (focusedTheme ? `t:${focusedTheme}` : null) : selectedId ? `p:${selectedId}` : null;

  const linkedKeys = useMemo(() => {
    if (!hlKey) return null;
    const up = new Set([hlKey]);
    const dn = new Set([hlKey]);
    let ch = true;
    while (ch) {
      ch = false;
      for (const l of links) {
        if (up.has(l.t) && !up.has(l.s)) {
          up.add(l.s);
          ch = true;
        }
      }
    }
    ch = true;
    while (ch) {
      ch = false;
      for (const l of links) {
        if (dn.has(l.s) && !dn.has(l.t)) {
          dn.add(l.t);
          ch = true;
        }
      }
    }
    const hl = new Set<string>();
    for (const l of links) {
      if ((up.has(l.t) && up.has(l.s)) || (dn.has(l.s) && dn.has(l.t))) {
        hl.add(l.s);
        hl.add(l.t);
      }
    }
    hl.add(hlKey);
    return hl;
  }, [hlKey, links]);

  if (!model) return null;

  const { A, T, P, sortedThemes, themeWeight, themePartner, total } = model;
  const nodes = [...A, ...T, ...P];

  const title =
    sortedThemes.length > 1
      ? `Most of the match runs through ${sortedThemes[0]!.toLowerCase()}, then ${sortedThemes[1]!.toLowerCase()}`
      : `The match runs through ${sortedThemes[0]!.toLowerCase()}`;
  const subtitle = `Top ${top.length} partners. A thicker flow means more of the overlap comes from that theme.`;

  return (
    <ChartCard
      id="c-sank"
      className="ov-sank"
      title={title}
      subtitle={subtitle}
      legend={
        <div className="ov-key">
          <span>
            <i style={{ background: "var(--ov-coral)" }} />
            Your anchors
          </span>
          <span>
            <i style={{ background: "var(--ov-plum)" }} />
            Shared taste themes
          </span>
          <span>
            <i style={{ background: "var(--ov-blue)" }} />
            Partners
          </span>
        </div>
      }
      chart={
        <div>
          <div className="ov-scroll">
            <svg
              viewBox={`0 0 ${SK.W} ${SK.H}`}
              style={{ minWidth: NARROW ? 640 : undefined }}
              role="group"
              aria-label="Flow from your anchors, through shared taste themes, to partners"
            >
              <defs>
                <linearGradient id="ska" gradientUnits="userSpaceOnUse" x1={SK.x[0] + SK.nw} x2={SK.x[1]}>
                  <stop offset="0" stopColor="#FF6B57" />
                  <stop offset="1" stopColor="#6B3FA0" />
                </linearGradient>
                <linearGradient id="skb" gradientUnits="userSpaceOnUse" x1={SK.x[1] + SK.nw} x2={SK.x[2]}>
                  <stop offset="0" stopColor="#6B3FA0" />
                  <stop offset="1" stopColor="#4F5BFF" />
                </linearGradient>
              </defs>
              {links.map((l, i) => {
                const xm = (l.x0 + l.x1) / 2;
                const on =
                  !linkedKeys ||
                  ((linkedKeys.has(l.s) && linkedKeys.has(l.t)));
                return (
                  <path
                    key={i}
                    className="ov-sl"
                    d={`M${l.x0},${l.y0.toFixed(1)}C${xm},${l.y0.toFixed(1)} ${xm},${l.y1.toFixed(1)} ${l.x1},${l.y1.toFixed(1)}`}
                    fill="none"
                    stroke={`url(#${l.grad})`}
                    strokeOpacity={0.42}
                    strokeWidth={Math.max(l.w, 1)}
                    style={{ opacity: on ? 1 : 0.16 }}
                  />
                );
              })}
              {(
                [
                  ["Your anchors", SK.x[0], "end"],
                  ["Shared taste themes", SK.x[1], "start"],
                  ["Partners", SK.x[2], "start"],
                ] as const
              ).map(([label, x, anchor], i) => (
                <text
                  key={label}
                  className="ov-sk-h"
                  x={i === 0 ? x + SK.nw : x}
                  y={20}
                  textAnchor={anchor}
                >
                  {label}
                </text>
              ))}
              {nodes.map((n) => {
                const dim = linkedKeys && !linkedKeys.has(n.key);
                const lx = n.col === 0 ? n.x - 8 : n.x + SK.nw + 8;
                const partnerBind =
                  n.col === 2 && n.partner
                    ? bindPartnerPointer(n.partner.id, {
                        setHover,
                        select,
                        lines: (): TipLine[] => [
                          { className: "v", text: `${Math.round(n.partner!.matchScore)} overlap` },
                          { className: "l", text: `${n.partner!.name} · ${kindLabel(n.partner!.kind)}` },
                        ],
                      })
                    : null;
                return (
                  <g
                    key={n.key}
                    className={cn("ov-sk", n.col === 2 && "ov-pn", n.col === 1 && "is-taste")}
                    data-id={n.col === 2 ? n.id : undefined}
                    tabIndex={0}
                    role="button"
                    aria-label={n.col === 1 ? `${n.name}, shared taste. Press to light it up in every chart.` : n.name}
                    aria-pressed={n.col === 1 ? focus.taste?.id === tasteId(n.name) : undefined}
                    style={{ opacity: dim ? 0.55 : 1 }}
                    {...(partnerBind ?? {
                      onMouseEnter: (e: React.MouseEvent) => {
                        tipShow(
                          [
                            { className: "v", text: n.name },
                            {
                              className: "l",
                              text: n.col === 0 ? "Anchor you chose" : "Taste theme Qloo found in common",
                            },
                          ],
                          e.clientX,
                          e.clientY,
                        );
                      },
                      onMouseMove: (e: React.MouseEvent) => tipMove(e.clientX, e.clientY),
                      onMouseLeave: () => tipHide(),
                      onFocus: (e: React.FocusEvent<SVGGElement>) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        tipShow(
                          [
                            { className: "v", text: n.name },
                            {
                              className: "l",
                              text: n.col === 0 ? "Anchor you chose" : "Taste theme Qloo found in common",
                            },
                          ],
                          r.left + r.width / 2,
                          r.top,
                        );
                      },
                      onBlur: () => tipHide(),
                    })}
                    {...(n.col === 1
                      ? {
                          onClick: () => focus.toggle(tasteId(n.name)),
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              focus.toggle(tasteId(n.name));
                            }
                          },
                        }
                      : {})}
                  >
                    <rect
                      x={n.x}
                      y={n.y}
                      width={SK.nw}
                      height={n.h}
                      rx={4}
                      fill={n.c}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                    <rect x={n.x - 6} y={n.y - 2} width={SK.nw + 12} height={n.h + 4} fill="transparent" />
                    <text
                      className="ov-sk-l"
                      x={lx}
                      y={n.y + n.h / 2 + 4.5}
                      textAnchor={n.col === 0 ? "end" : "start"}
                    >
                      {n.name}
                    </text>
                    {n.col === 2 && n.partner && n.h >= 34 ? (
                      <text className="ov-sk-h" x={lx} y={n.y + n.h / 2 + 19} textAnchor="start">
                        {Math.round(n.partner.matchScore)} overlap
                      </text>
                    ) : null}
                    {n.col === 0 ? (
                      <text className="ov-sk-h" x={lx} y={n.y + n.h / 2 + 19} textAnchor="end">
                        your anchor
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
          {NARROW ? <p className="ov-mobhint">Swipe sideways to see the partners.</p> : null}
        </div>
      }
      table={
        <DataTable
          head={["Theme", "Share of match", "Feeds"]}
          rows={sortedThemes.map((t) => [
            t,
            `${Math.round(((themeWeight.get(t) ?? 0) / Math.max(total, 0.01)) * 100)}%`,
            themePartner
              .filter((x) => x.t === t)
              .sort((a, b) => b.v - a.v)
              .map((x) => top.find((p) => p.id === x.p)?.name ?? x.p)
              .join(", "),
          ])}
        />
      }
    />
  );
}

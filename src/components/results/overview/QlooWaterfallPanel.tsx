import { useEffect, useMemo, useRef } from "react";
import type { Partner, QlooCallRecord } from "@shared/types";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { prefersStaticMotion } from "@/lib/overviewModel";

const STATIC =
  typeof window !== "undefined" && prefersStaticMotion();

type TimedCall = QlooCallRecord & { t0: number; d: number };

/** Layout real call records on a shared timeline from their start timestamps. Never invents timings. */
function layoutCalls(calls: QlooCallRecord[]): { rows: TimedCall[]; totalMs: number; seqMs: number } {
  if (!calls.length) return { rows: [], totalMs: 0, seqMs: 0 };
  const sorted = [...calls].sort((a, b) => a.at - b.at);
  const origin = sorted[0]!.at;
  const rows: TimedCall[] = sorted.map((c) => ({
    ...c,
    t0: Math.max(0, c.at - origin),
    d: Math.max(0, Math.round(c.ms)),
  }));
  const totalMs = Math.max(...rows.map((c) => c.t0 + c.d), 1);
  const seqMs = rows.reduce((s, c) => s + c.d, 0);
  return { rows, totalMs, seqMs };
}

function endpointLabel(path: string): string {
  const clean = path.replace(/^https?:\/\/[^/]+/i, "");
  if (clean.startsWith("/")) return clean.length > 42 ? `${clean.slice(0, 40)}…` : clean;
  return clean.length > 42 ? `${clean.slice(0, 40)}…` : clean || path;
}

function statusLabel(c: QlooCallRecord): string {
  return c.status === "ok" ? "ok" : "error";
}

export function QlooWaterfallPanel({
  calls,
  partners,
  anchors,
}: {
  calls: QlooCallRecord[];
  partners: Partner[];
  anchors: string[];
}) {
  const { rows, totalMs, seqMs } = useMemo(() => layoutCalls(calls), [calls]);
  const scanRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rows.length === 0) return;
    const box = barsRef.current;
    if (!box) return;
    const bars = box.querySelectorAll<HTMLElement>(".ov-bar2");
    if (STATIC) {
      bars.forEach((b) => {
        b.style.transition = "none";
        b.style.transform = "scaleX(1)";
      });
      return;
    }
    bars.forEach((b) => {
      b.style.transform = "scaleX(0)";
    });
    requestAnimationFrame(() => {
      bars.forEach((b) => {
        const t0 = Number(b.dataset.t0 ?? 0);
        const d = Number(b.dataset.d ?? 0);
        b.style.transition = `transform ${d}ms linear ${t0}ms`;
        b.style.transform = "scaleX(1)";
      });
    });
    const sc = scanRef.current;
    if (sc) {
      sc.animate(
        [
          { left: "0%", opacity: 0 },
          { left: "0%", opacity: 1, offset: 0.03 },
          { left: "100%", opacity: 1, offset: 0.97 },
          { left: "100%", opacity: 0 },
        ],
        { duration: Math.min(Math.max(totalMs, 400), 8000), easing: "linear", fill: "forwards" },
      );
    }
  }, [rows, totalMs]);

  // Hide when there is no real call log — never invent timings
  if (rows.length === 0) return null;

  const totalSec = (totalMs / 1000).toFixed(1);
  const title = `${rows.length} Qloo call${rows.length === 1 ? "" : "s"} built this page in ${totalSec} seconds`;
  const subtitle =
    "Each bar is one request from the real server call log. Calls that do not depend on each other may overlap. Timings are measured, not estimated.";

  const fromQ = [
    anchors.length
      ? `Taste tags / entities for your ${anchors.length} anchor${anchors.length === 1 ? "" : "s"}`
      : "Taste tags for your anchors",
    "Brands and places that overlap with your crowd",
    partners.some((p) => (p.sharedTags?.length ?? 0) > 0)
      ? "Why each one matched, as shared themes"
      : null,
    "Where your crowd gathers on the map (when heatmap is available)",
    "How two crowds differ, taste by taste (when compare succeeds)",
  ].filter(Boolean) as string[];

  const fromV = [
    "Distance, ease of approach and the safe-to-wildcard ranking",
    "Surprise scores and “realistic for me” feasibility",
    "The first-message ideas and outreach drafts",
  ];

  const lims = [
    "Overlap is relative to this search. It is not a count of real people.",
    "Raw heat follows popularity, so the map shows taste lift instead when available.",
    "Ease and surprise are Venn estimates — they are not Qloo fields.",
  ];

  return (
    <ChartCard
      id="c-wf"
      className="ov-wf-card"
      title={title}
      subtitle={subtitle}
      chart={
        <div className="ov-wf">
          <div className="ov-wf-scroll">
            <div className="ov-wfp" ref={barsRef}>
              {rows.map((c, i) => {
                const end = (c.t0 + c.d) / totalMs;
                return (
                  <div className="ov-wrow" key={`${c.path}-${c.at}-${i}`}>
                    <div className="ov-wl">
                      <b>{endpointLabel(c.path)}</b>
                      <span>
                        {c.step ? `${c.step} · ` : ""}
                        {statusLabel(c)}
                      </span>
                    </div>
                    <div className="ov-wt">
                      <div
                        className="ov-bar2"
                        data-t0={c.t0}
                        data-d={c.d}
                        style={{
                          left: `${(c.t0 / totalMs) * 100}%`,
                          width: `${Math.max((c.d / totalMs) * 100, 0.4)}%`,
                        }}
                      />
                      <em
                        style={
                          end > 0.7
                            ? { right: `${(1 - c.t0 / totalMs) * 100 + 1.2}%` }
                            : { left: `${end * 100 + 1.2}%` }
                        }
                      >
                        {c.d} ms
                      </em>
                    </div>
                  </div>
                );
              })}
              <div className="ov-wax">
                <span />
                <div className="ov-axl">
                  {["0 s", "¼", "½", "¾", `${totalSec} s`].map((t, i) => (
                    <span
                      key={t}
                      style={{
                        left: `${i * 25}%`,
                        transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : undefined,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <p className="ov-wsum">
                <b>Wall clock: {totalSec} s</b>
                {seqMs > totalMs + 50
                  ? ` instead of ${(seqMs / 1000).toFixed(1)} s one after another.`
                  : "."}
              </p>
              <div className="ov-scanbox">
                <div className="ov-scan" ref={scanRef} />
              </div>
            </div>
          </div>
          <div className="ov-split">
            <div className="ov-stats">
              <div>
                <b>{String(rows.length)}</b>
                <span>Qloo calls</span>
              </div>
              <div>
                <b>{totalSec} s</b>
                <span>end to end</span>
              </div>
              <div>
                <b>{String(partners.length)}</b>
                <span>partners ranked</span>
              </div>
            </div>
            <h4>
              <i style={{ background: "var(--ov-blue)" }} />
              From Qloo
            </h4>
            <ul>
              {fromQ.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h4>
              <i style={{ background: "var(--ov-ink)" }} />
              Added by Venn
            </h4>
            <ul>
              {fromV.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h4>
              <i style={{ background: "var(--ov-line-strong)" }} />
              Limits worth knowing
            </h4>
            <ul>
              {lims.map((t) => (
                <li className="lim" key={t}>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      }
      table={
        <DataTable
          head={["Endpoint", "Step", "Started (ms)", "Took (ms)", "Status"]}
          rows={rows.map((c) => [
            endpointLabel(c.path),
            c.step ?? "—",
            String(c.t0),
            String(c.d),
            statusLabel(c),
          ])}
        />
      }
    />
  );
}

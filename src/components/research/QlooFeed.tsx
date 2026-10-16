import { useMemo } from "react";
import type { AgentEvent } from "@shared/types";
import { cn } from "@/lib/cn";

interface Pair {
  req: string;
  res: string;
  ms: string;
  reqOn: boolean;
  resOn: boolean;
}

function formatMs(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")} s`;
  return `${Math.round(ms)} ms`;
}

/** Light "From Qloo" card — last 2 request/response pairs from the real call log. */
export function QlooFeed({ events, className }: { events: AgentEvent[]; className?: string }) {
  const pairs = useMemo(() => {
    const out: Pair[] = [];
    const tools = events.filter(
      (e): e is Extract<AgentEvent, { type: "tool_call" | "tool_result" }> =>
        e.type === "tool_call" || e.type === "tool_result",
    );

    let pending: { label: string; on: boolean } | null = null;
    for (const e of tools) {
      if (e.type === "tool_call") {
        const label = e.args ? `${e.tool} · ${e.args}` : e.tool;
        pending = { label, on: true };
      } else if (e.type === "tool_result" && pending) {
        out.push({
          req: pending.label,
          res: e.summary,
          ms: formatMs(e.ms),
          reqOn: pending.on,
          resOn: true,
        });
        pending = null;
      }
    }
    if (pending) {
      out.push({
        req: pending.label,
        res: "…",
        ms: "",
        reqOn: true,
        resOn: false,
      });
    }
    return out.slice(-2);
  }, [events]);

  return (
    <section
      className={cn(
        "rounded-3xl border border-[#E3E6EB] bg-white px-5 pb-4 pt-[18px]",
        className,
      )}
      aria-label="Qloo calls"
    >
      <h2 className="m-0 text-base font-bold tracking-[-0.015em] text-[#14151A]">From Qloo</h2>
      <p className="mb-3 mt-0.5 text-[0.88rem] text-[#596070]">
        Every request Venn makes, as it happens.
      </p>
      <div className="grid min-h-[112px] content-start gap-2.5">
        {pairs.length === 0 ? (
          <p className="text-[0.9rem] text-[#8A91A0]">Waiting for the first call…</p>
        ) : (
          pairs.map((pair, i) => (
            <div key={`${pair.req}-${i}`} className="contents">
              <div
                className={cn(
                  "grid grid-cols-[18px_1fr_auto] gap-x-2 text-[0.9rem] leading-[1.35] transition-[opacity,transform] duration-[350ms]",
                  pair.reqOn ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
                )}
              >
                <i className="not-italic font-bold text-[#FF6B57]">→</i>
                <span className="text-[#596070]">{pair.req}</span>
                <em className="text-[0.84rem] not-italic tabular-nums text-[#8A91A0]" />
              </div>
              <div
                className={cn(
                  "grid grid-cols-[18px_1fr_auto] gap-x-2 text-[0.9rem] leading-[1.35] transition-[opacity,transform] duration-[350ms]",
                  pair.resOn ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
                )}
              >
                <i className="not-italic font-bold text-[#4F5BFF]">←</i>
                <span className="font-medium text-[#14151A]">{pair.res}</span>
                <em className="text-[0.84rem] not-italic tabular-nums text-[#8A91A0]">{pair.ms}</em>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

import { DECISION_ORIGIN_LABELS } from "@shared/constants";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useVenn } from "@/store/useVenn";

const KIND_COLORS: Record<string, string> = {
  drink: "#7dd3c0",
  wellness: "#9ec5f0",
  culture: "#c4a8e8",
  retail: "#f0c48a",
  fitness: "#8fd4a8",
  music: "#d4a0e8",
  food: "#f0b87a",
  venue: "#9aa8ff",
  fashion: "#f0a0c0",
};

function colorize(line: string): ReactNode {
  const parts = line.split(/(\b(?:drink|wellness|culture|retail|fitness|music|food|venue|fashion)\b|\d+\s*ms)/gi);
  return parts.map((part, index) => {
    const key = part.toLowerCase();
    if (KIND_COLORS[key]) {
      return (
        <span key={index} style={{ color: KIND_COLORS[key], fontWeight: 600 }}>
          {part}
        </span>
      );
    }
    if (/\d+\s*ms/i.test(part)) {
      return (
        <span key={index} className="text-paper/55">
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function ToolLog() {
  const events = useVenn((state) => state.events);
  const result = useVenn((state) => state.result);
  const ref = useRef<HTMLDivElement>(null);
  const prefix = result?.provider === "qloo" ? "qloo" : "demo";
  const lines = events.flatMap((event) => {
    if (event.type === "tool_call") return [`→ ${prefix}.${event.tool}(${event.args})`];
    if (event.type === "tool_result") return [`← ${event.summary} · ${event.ms} ms`];
    if (event.type === "decision") {
      const originLabel = DECISION_ORIGIN_LABELS[event.origin ?? "rule"];
      return [`◆ [${originLabel}] ${event.decision} — ${event.reason}`];
    }
    return [];
  });

  useEffect(() => {
    const node = ref.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines.length]);

  return (
    <div
      ref={ref}
      className="h-48 overflow-auto rounded-[20px] border border-ink bg-ink px-4 py-3 text-[12px] leading-6 text-paper tabular"
    >
      {lines.length === 0 ? <p className="text-paper/60">Waiting for the first lookup…</p> : null}
      {lines.map((line, index) => (
        <p key={`${index}-${line}`} className="animate-[fade_150ms_ease]">
          {line.startsWith("→") ? <span className="text-coral">{colorize(line)}</span> : null}
          {line.startsWith("←") ? <span className="text-paper/90">{colorize(line)}</span> : null}
          {line.startsWith("◆") ? <span className="text-blue-soft">{colorize(line)}</span> : null}
        </p>
      ))}
    </div>
  );
}

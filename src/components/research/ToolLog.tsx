import { useEffect, useRef } from "react";
import { useVenn } from "@/store/useVenn";

export function ToolLog() {
  const events = useVenn((state) => state.events);
  const result = useVenn((state) => state.result);
  const ref = useRef<HTMLDivElement>(null);
  const prefix = result?.provider === "qloo" ? "qloo" : "demo";
  const lines = events.flatMap((event) => {
    if (event.type === "tool_call") return [`→ ${prefix}.${event.tool}(${event.args})`];
    if (event.type === "tool_result") return [`← ${event.summary} · ${event.ms} ms`];
    if (event.type === "decision") return [`◆ ${event.decision} — ${event.reason}`];
    return [];
  });

  useEffect(() => {
    const node = ref.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines.length]);

  return (
    <div ref={ref} className="h-48 overflow-auto rounded-[20px] border border-line bg-ink px-4 py-3 font-mono text-[12px] leading-6 text-paper">
      {lines.length === 0 ? <p className="text-paper/60">Waiting for the first lookup…</p> : null}
      {lines.map((line, index) => (
        <p key={`${index}-${line}`} className="animate-[fade_150ms_ease]">{line}</p>
      ))}
    </div>
  );
}

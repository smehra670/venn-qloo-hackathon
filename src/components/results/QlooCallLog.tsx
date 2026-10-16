import { STEP_TITLES } from "@shared/constants";
import type { QlooCallRecord } from "@shared/types";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useVenn } from "@/store/useVenn";

function groupByStep(calls: QlooCallRecord[]): { step: string; title: string; calls: QlooCallRecord[] }[] {
  const groups = new Map<string, QlooCallRecord[]>();
  for (const call of calls) {
    const key = call.step ?? "other";
    const list = groups.get(key) ?? [];
    list.push(call);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([step, stepCalls]) => ({
    step,
    title: step in STEP_TITLES ? STEP_TITLES[step as keyof typeof STEP_TITLES] : "Other",
    calls: stepCalls,
  }));
}

function paramsLine(params: Record<string, string>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "(no params)";
  return entries.map(([key, value]) => `${key}=${value}`).join(" · ");
}

export function QlooCallLog() {
  const open = useVenn((state) => state.callLogOpen);
  const close = useVenn((state) => state.closeCallLog);
  const calls = useVenn((state) => state.calls);
  const loading = useVenn((state) => state.callsLoading);
  const result = useVenn((state) => state.result);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const groups = groupByStep(calls);
  const isLiveQloo = result?.provider === "qloo" && !result.providerLabel.toLowerCase().includes("saved");

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qloo-call-log-title"
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col overflow-auto rounded-t-[12px] border border-line bg-paper p-5 md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[420px] md:rounded-none md:border-y-0 md:border-r-0"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="qloo-call-log-title" className="font-bold text-2xl tracking-tight">How Venn used Qloo</h2>
        <button type="button" aria-label="Close" onClick={close} className="min-h-11 min-w-11 rounded-full p-2 hover:bg-paper-2">
          <X size={18} />
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Every live Qloo HTTP call this search made, grouped by step. Params are redacted (truncated, no secrets).
      </p>
      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
      {!loading && calls.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          {isLiveQloo
            ? "No Qloo calls were recorded for this search."
            : "No live Qloo calls were made for this search (demo data)."}
        </p>
      ) : null}
      {!loading && groups.length > 0 ? (
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <section key={group.step}>
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                {group.title} · {group.calls.length} call{group.calls.length === 1 ? "" : "s"}
              </h3>
              <ul className="mt-2 space-y-2">
                {group.calls.map((call) => (
                  <li key={call.id} className="rounded-xl border border-line bg-paper px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2 font-mono">
                      <span className={call.status === "ok" ? "text-ink" : "text-rose-700"}>{call.path}</span>
                      <span className="text-ink-soft">{call.ms} ms</span>
                    </div>
                    <p className="mt-1 break-words text-ink-soft">{paramsLine(call.params)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

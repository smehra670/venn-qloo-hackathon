import type { AgentEvent, Brief, BusinessInput, Heatmap, RunResult, StoredEvent } from "@shared/types";
import { nanoid } from "nanoid";

export interface Run {
  id: string;
  status: "running" | "done" | "error" | "cancelled";
  createdAt: number;
  input: BusinessInput;
  events: StoredEvent[];
  result?: RunResult;
  error?: string;
  abort: AbortController;
  subscribers: Set<(event: StoredEvent) => void>;
  heatmaps: Map<string, Heatmap | null>;
  briefs: Map<string, Brief>;
  toolCalls: number;
}

const runs = new Map<string, Run>();
const TTL_MS = 60 * 60 * 1000;
const MAX_RUNS = 300;

export function createRun(input: BusinessInput): Run {
  prune();
  const run: Run = {
    id: nanoid(12),
    status: "running",
    createdAt: Date.now(),
    input,
    events: [],
    abort: new AbortController(),
    subscribers: new Set(),
    heatmaps: new Map(),
    briefs: new Map(),
    toolCalls: 0,
  };
  runs.set(run.id, run);
  return run;
}

export function getRun(id: string): Run | undefined {
  const run = runs.get(id);
  if (!run) return undefined;
  if (Date.now() - run.createdAt > TTL_MS) {
    runs.delete(id);
    return undefined;
  }
  return run;
}

export function append(run: Run, event: AgentEvent): StoredEvent {
  const stored = { ...event, id: run.events.length + 1, at: Date.now() } as StoredEvent;
  run.events.push(stored);
  if (event.type === "result") {
    run.status = "done";
    run.result = event.result;
  } else if (event.type === "error") {
    run.status = "error";
    run.error = event.message;
  } else if (event.type === "cancelled") {
    run.status = "cancelled";
  }
  for (const subscriber of run.subscribers) {
    try {
      subscriber(stored);
    } catch {
      subscriberDelete(run, subscriber);
    }
  }
  return stored;
}

function subscriberDelete(run: Run, subscriber: (event: StoredEvent) => void): void {
  run.subscribers.delete(subscriber);
}

export function abortAll(): void {
  for (const run of runs.values()) {
    if (run.status === "running") run.abort.abort();
  }
}

function prune(): void {
  const now = Date.now();
  for (const [id, run] of runs) {
    if (now - run.createdAt > TTL_MS) {
      run.abort.abort();
      runs.delete(id);
    }
  }
  if (runs.size <= MAX_RUNS) return;
  const finished = [...runs.values()]
    .filter((run) => run.status !== "running")
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const run of finished) {
    if (runs.size <= MAX_RUNS) return;
    runs.delete(run.id);
  }
  while (runs.size > MAX_RUNS) {
    const oldest = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) return;
    oldest.abort.abort();
    runs.delete(oldest.id);
  }
}

const timer = setInterval(() => prune(), 60_000);
timer.unref();

export function disposeStore(): void {
  clearInterval(timer);
}

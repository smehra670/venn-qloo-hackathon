import type { QlooCallRecord, StepId } from "@shared/types";
import { AsyncLocalStorage } from "node:async_hooks";

/** Caps how many records a single run accumulates (oldest dropped first), matching
 * `RunResult.calls`'s documented cap. */
export const CALL_LOG_CAP = 120;

/** Per-character cap for a single redacted param value, so a long entity-id list or free-text
 * query can't bloat a run's stored call log. Truncated values are marked with `…(+N)`. */
const PARAM_VALUE_MAX = 200;

export interface QlooCallSink {
  /** Appends one record, enforcing `CALL_LOG_CAP` (drops the oldest when full). */
  record(entry: Omit<QlooCallRecord, "id" | "at">): void;
}

interface CallLogStore {
  sink: QlooCallSink;
  step?: StepId;
}

const als = new AsyncLocalStorage<CallLogStore>();

/** A plain in-memory array-backed sink: pushes onto `target`, dropping the oldest entry past
 * `CALL_LOG_CAP`. `target` is typically `run.calls` — callers keep the same array reference so
 * the cap applies across the whole run's lifetime (initial pipeline + any later quiet-context
 * calls like expand/heatmap/compare/check/proof). */
export function arraySink(target: QlooCallRecord[], makeId: () => string): QlooCallSink {
  return {
    record(entry) {
      target.push({ ...entry, id: makeId(), at: Date.now() });
      while (target.length > CALL_LOG_CAP) target.shift();
    },
  };
}

/** Runs `fn` with `sink` installed as the active call-log destination for the duration of the
 * async call chain (survives `await`s, correctly isolated between concurrently-running runs —
 * unlike a plain module-level variable, which a second run's interleaved awaits would stomp on). */
export function withQlooCallSink<T>(sink: QlooCallSink, fn: () => Promise<T>): Promise<T> {
  return als.run({ sink }, fn);
}

/** Re-runs the active call-log context with `step` attached, so calls made inside `fn` are
 * attributed to that step in the call log. No-op (just calls `fn`) when no sink is active —
 * e.g. in tests, or code paths that never opted into call logging. */
export function withQlooStep<T>(step: StepId | undefined, fn: () => Promise<T>): Promise<T> {
  const current = als.getStore();
  if (!current) return fn();
  return als.run({ ...current, step }, fn);
}

function truncateValue(value: string): string {
  if (value.length <= PARAM_VALUE_MAX) return value;
  return `${value.slice(0, PARAM_VALUE_MAX)}…(+${value.length - PARAM_VALUE_MAX})`;
}

/** Turns the mixed string/number/boolean/array param bag a live Qloo call was made with into a
 * plain, safely-sized `Record<string, string>` — no secrets travel in params (the API key is a
 * header only), but a long entity-id list or free-text query is truncated so one call can't
 * blow out the call log's footprint. */
export function redactQlooParams(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    const stringified = Array.isArray(value) ? value.map(String).join(",") : String(value);
    out[key] = truncateValue(stringified);
  }
  return out;
}

/** Appends a redacted call record to the active sink (a no-op when no sink is active, e.g. in
 * unit tests that call the qloo client functions directly). `step` is read from the active
 * context (see `withQlooStep`), not passed by the caller, so every function that calls
 * `qlooGet` — `searchEntities`, `insights`, `searchTags`, `compareEntities` — gets step
 * attribution for free. */
export function recordQlooCall(entry: { path: string; params: Record<string, unknown>; status: "ok" | "error"; ms: number }): void {
  const current = als.getStore();
  if (!current) return;
  current.sink.record({
    path: entry.path,
    params: redactQlooParams(entry.params),
    status: entry.status,
    ms: entry.ms,
    ...(current.step !== undefined ? { step: current.step } : {}),
  });
}

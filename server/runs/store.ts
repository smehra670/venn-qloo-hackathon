import type { AgentEvent, Brief, BusinessInput, Heatmap, ProofResult, QlooCallRecord, RunResult, StoredEvent } from "@shared/types";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";

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
  /** Cached Proof build (see `server/proof.ts`): rebuilding it re-does rank-together calls, so
   * the first successful build for a run is kept until the process restarts. Not persisted to
   * the sqlite row — a restart losing the cache just costs one rebuild, same as `briefs`. */
  proof?: ProofResult;
  toolCalls: number;
  /** Forces the live Qloo provider for this run even when TASTE_PROVIDER=snapshot. */
  live?: boolean;
  /** Redacted live-Qloo call log for this run (see `server/providers/qloo/callLog.ts`), capped
   * at `CALL_LOG_CAP`. Grown during the initial pipeline and by any later quiet-context calls
   * (expand/heatmap/compare/check/proof) against this run. Mirrored onto `RunResult.calls`
   * once the pipeline finishes; not itself persisted to sqlite (same as `briefs`/`heatmaps` —
   * a restart losing it just costs a fresh, empty log for that run). */
  calls: QlooCallRecord[];
  /** How many live `/v2/analysis/compare` calls this run has spent, capped at
   * `config.compareMaxCallsPerRun` (see `server/compare.ts`). */
  compareCallsUsed: number;
}

interface RunRow {
  id: string;
  status: Run["status"];
  created_at: number;
  input_json: string;
  result_json: string | null;
  error: string | null;
  events_json: string;
}

const TTL_MS = config.runTtlHours * 60 * 60 * 1000;
const MAX_MEMORY_RUNS = 300;

const runs = new Map<string, Run>();

function resolveDbPath(): string {
  if (config.nodeEnv === "test") return ":memory:";
  const dir = path.resolve(process.cwd(), config.dataDir);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "venn.db");
}

const dbPath = resolveDbPath();
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    input_json TEXT NOT NULL,
    result_json TEXT,
    error TEXT,
    events_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS daily_caps (
    ip_hash TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ip_hash, day)
  );
  CREATE TABLE IF NOT EXISTS shares (
    token TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// A previous process died mid-run. Those runs can never finish, so close them out.
db.prepare(
  `UPDATE runs SET status = 'error', error = 'Server restarted' WHERE status = 'running'`,
).run();

const insertRunStmt = db.prepare(
  `INSERT INTO runs (id, status, created_at, input_json, result_json, error, events_json)
   VALUES (@id, @status, @createdAt, @inputJson, @resultJson, @error, @eventsJson)`,
);
const updateRunStmt = db.prepare(
  `UPDATE runs SET status = @status, result_json = @resultJson, error = @error, events_json = @eventsJson
   WHERE id = @id`,
);
const selectRunStmt = db.prepare(`SELECT * FROM runs WHERE id = ?`);
const deleteRunStmt = db.prepare(`DELETE FROM runs WHERE id = ?`);
const pruneRunsStmt = db.prepare(`DELETE FROM runs WHERE created_at < ?`);

function persist(run: Run): void {
  updateRunStmt.run({
    id: run.id,
    status: run.status,
    resultJson: run.result ? JSON.stringify(run.result) : null,
    error: run.error ?? null,
    eventsJson: JSON.stringify(run.events),
  });
}

export function createRun(input: BusinessInput, opts?: { live?: boolean }): Run {
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
    live: opts?.live,
    calls: [],
    compareCallsUsed: 0,
  };
  runs.set(run.id, run);
  insertRunStmt.run({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    inputJson: JSON.stringify(run.input),
    resultJson: null,
    error: null,
    eventsJson: "[]",
  });
  return run;
}

function fromRow(row: RunRow): Run {
  const events = JSON.parse(row.events_json) as StoredEvent[];
  const result = row.result_json ? (JSON.parse(row.result_json) as RunResult) : undefined;
  const run: Run = {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    input: JSON.parse(row.input_json) as BusinessInput,
    events,
    result,
    error: row.error ?? undefined,
    abort: new AbortController(),
    subscribers: new Set(),
    heatmaps: new Map(),
    briefs: new Map(),
    toolCalls: events.filter((event) => event.type === "tool_call").length,
    calls: result?.calls ? [...result.calls] : [],
    compareCallsUsed: 0,
  };
  if (run.status !== "running") run.abort.abort();
  return run;
}

export function getRun(id: string): Run | undefined {
  const inMemory = runs.get(id);
  if (inMemory) {
    if (Date.now() - inMemory.createdAt > TTL_MS) {
      runs.delete(id);
      deleteRunStmt.run(id);
      return undefined;
    }
    return inMemory;
  }
  const row = selectRunStmt.get(id) as RunRow | undefined;
  if (!row) return undefined;
  if (Date.now() - row.created_at > TTL_MS) {
    deleteRunStmt.run(id);
    return undefined;
  }
  const run = fromRow(row);
  runs.set(run.id, run);
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
  persist(run);
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
  pruneRunsStmt.run(now - TTL_MS);
  pruneSharesStmt.run(now);
  if (runs.size <= MAX_MEMORY_RUNS) return;
  const finished = [...runs.values()]
    .filter((run) => run.status !== "running")
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const run of finished) {
    if (runs.size <= MAX_MEMORY_RUNS) return;
    runs.delete(run.id);
  }
  while (runs.size > MAX_MEMORY_RUNS) {
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
  db.close();
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${config.appSalt}:${ip}`).digest("hex");
}

const countForDayStmt = db.prepare(`SELECT count FROM daily_caps WHERE ip_hash = ? AND day = ?`);
const upsertCapStmt = db.prepare(`
  INSERT INTO daily_caps (ip_hash, day, count) VALUES (@ipHash, @day, 1)
  ON CONFLICT (ip_hash, day) DO UPDATE SET count = count + 1
`);
const pruneCapsStmt = db.prepare(`DELETE FROM daily_caps WHERE day < ?`);

export function canStartRun(ip: string): boolean {
  const hash = hashIp(ip);
  const row = countForDayStmt.get(hash, currentDay()) as { count: number } | undefined;
  return (row?.count ?? 0) < config.dailyRunCapPerIp;
}

export function recordRun(ip: string): void {
  upsertCapStmt.run({ ipHash: hashIp(ip), day: currentDay() });
}

export function getStoreStats(): {
  type: "sqlite";
  dataDir: string;
  memoryRuns: number;
  dbRuns: number;
  dbPath: string;
} {
  const dbRuns = (db.prepare(`SELECT COUNT(*) AS count FROM runs`).get() as { count: number }).count;
  // Daily caps outlive a single day only long enough to answer "today"; prune anything older.
  pruneCapsStmt.run(currentDay());
  return {
    type: "sqlite",
    dataDir: config.dataDir,
    memoryRuns: runs.size,
    dbRuns,
    dbPath,
  };
}

/** Share links outlive the run itself (runs expire after `RUN_TTL_HOURS`, shares after
 * `SHARE_TTL_HOURS`, 7 days by default), so the row snapshots the finished result rather than
 * pointing back at the run. */
const SHARE_TTL_MS = config.shareTtlHours * 60 * 60 * 1000;

interface ShareRow {
  token: string;
  run_id: string;
  result_json: string;
  created_at: number;
  expires_at: number;
}

const insertShareStmt = db.prepare(
  `INSERT INTO shares (token, run_id, result_json, created_at, expires_at)
   VALUES (@token, @runId, @resultJson, @createdAt, @expiresAt)`,
);
const selectShareStmt = db.prepare(`SELECT * FROM shares WHERE token = ?`);
const deleteShareStmt = db.prepare(`DELETE FROM shares WHERE token = ?`);
const pruneSharesStmt = db.prepare(`DELETE FROM shares WHERE expires_at < ?`);

export interface ShareRecord {
  token: string;
  expiresAt: number;
}

/** Snapshots a finished run's result under a fresh opaque token, good for `SHARE_TTL_MS`. */
export function createShare(run: Run): ShareRecord {
  if (!run.result) throw httpErrorLike(409, "That search is still running.");
  const token = nanoid(24);
  const createdAt = Date.now();
  const expiresAt = createdAt + SHARE_TTL_MS;
  insertShareStmt.run({
    token,
    runId: run.id,
    resultJson: JSON.stringify(run.result),
    createdAt,
    expiresAt,
  });
  return { token, expiresAt };
}

/** Looks up a share token, pruning (and treating as missing) anything past its TTL. */
export function getShare(token: string): { runId: string; result: RunResult } | undefined {
  const row = selectShareStmt.get(token) as ShareRow | undefined;
  if (!row) return undefined;
  if (Date.now() > row.expires_at) {
    deleteShareStmt.run(token);
    return undefined;
  }
  return { runId: row.run_id, result: JSON.parse(row.result_json) as RunResult };
}

function httpErrorLike(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export type UsageKind = "qloo" | "llm";

/** How many days of history `/api/usage` reports. */
const HISTORY_DAYS = 14;

function resolveDbPath(): string {
  if (config.nodeEnv === "test") return ":memory:";
  const dir = path.resolve(process.cwd(), config.dataDir);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "venn.db");
}

const db = new Database(resolveDbPath());
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS usage_counters (
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, kind)
  );
`);

const upsertStmt = db.prepare(`
  INSERT INTO usage_counters (day, kind, count) VALUES (@day, @kind, 1)
  ON CONFLICT (day, kind) DO UPDATE SET count = count + 1
`);
const countStmt = db.prepare(`SELECT count FROM usage_counters WHERE day = ? AND kind = ?`);
const historyStmt = db.prepare(`SELECT day, kind, count FROM usage_counters WHERE day >= ? ORDER BY day ASC`);
const pruneStmt = db.prepare(`DELETE FROM usage_counters WHERE day < ?`);

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Counts one Qloo HTTP call or one LLM completion call, bucketed by UTC day. Called from
 * `server/providers/qloo/client.ts` and `server/llm/openai.ts` so every real outbound call
 * is tallied regardless of which run or route triggered it. */
export function recordUsage(kind: UsageKind): void {
  try {
    upsertStmt.run({ day: currentDay(), kind });
  } catch {
    // Usage counting must never break the request it is measuring.
  }
}

export interface UsageSummary {
  qlooToday: number;
  llmToday: number;
}

/** Today's counts, surfaced on `/api/health`. */
export function getUsageSummary(): UsageSummary {
  const day = currentDay();
  const qlooToday = (countStmt.get(day, "qloo") as { count: number } | undefined)?.count ?? 0;
  const llmToday = (countStmt.get(day, "llm") as { count: number } | undefined)?.count ?? 0;
  return { qlooToday, llmToday };
}

export interface UsageDay {
  day: string;
  qloo: number;
  llm: number;
}

/** Last `HISTORY_DAYS` days of counts, surfaced on `GET /api/usage`. Also prunes rows older
 * than the window so the table does not grow forever. */
export function getUsageHistory(): UsageDay[] {
  const since = dayOffset(HISTORY_DAYS);
  pruneStmt.run(since);
  const rows = historyStmt.all(since) as { day: string; kind: UsageKind; count: number }[];
  const byDay = new Map<string, UsageDay>();
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { day: row.day, qloo: 0, llm: 0 };
    if (row.kind === "qloo") entry.qloo = row.count;
    else entry.llm = row.count;
    byDay.set(row.day, entry);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function closeUsageLedger(): void {
  db.close();
}

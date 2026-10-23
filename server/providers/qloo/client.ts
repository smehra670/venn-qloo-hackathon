import { config } from "../../config.js";
import { recordUsage } from "../../usage/ledger.js";
import { recordQlooCall } from "./callLog.js";
import {
  CompareResponseSchema,
  InsightsResponseSchema,
  SearchResponseSchema,
  TagsResponseSchema,
  type QlooEntity,
} from "./schemas.js";

export type { QlooEntity };

export class QlooHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QlooHttpError";
  }
}

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const circuit: CircuitState = { failures: 0, openedAt: null };

export function getCircuitState(): { open: boolean; failures: number; openedAt: number | null } {
  const open = circuit.openedAt !== null && Date.now() - circuit.openedAt < config.qlooCircuitCooldownMs;
  if (!open && circuit.openedAt !== null) {
    // Cooldown elapsed; let the next request through as a trial.
    circuit.openedAt = null;
    circuit.failures = 0;
  }
  return { open, failures: circuit.failures, openedAt: circuit.openedAt };
}

function recordFailure(): void {
  circuit.failures += 1;
  if (circuit.failures >= config.qlooCircuitFailures && circuit.openedAt === null) {
    circuit.openedAt = Date.now();
  }
}

function recordSuccess(): void {
  circuit.failures = 0;
  circuit.openedAt = null;
}

function assertCircuitClosed(): void {
  const state = getCircuitState();
  if (state.open) {
    throw new QlooHttpError("Qloo is temporarily unavailable after repeated failures. Try again shortly.", 503);
  }
}

// --- Client-side pacing -----------------------------------------------------------------
// Caps outbound request rate (QLOO_MAX_RPS) and concurrency (QLOO_MAX_IN_FLIGHT) so a burst
// of runs can't blow through the hackathon key's monthly quota in a few minutes. Admission is
// a small FIFO queue pumped synchronously, so there's no race between concurrent callers
// checking/incrementing the shared counters.

interface QueuedSlot {
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
}

let inFlight = 0;
let lastRequestStartedAt = 0;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;
const slotQueue: QueuedSlot[] = [];

function minIntervalMs(): number {
  return config.qlooMaxRps > 0 ? 1000 / config.qlooMaxRps : 0;
}

function pumpSlotQueue(): void {
  if (pumpTimer !== null) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
  while (slotQueue.length > 0) {
    const next = slotQueue[0];
    if (next?.signal?.aborted) {
      slotQueue.shift();
      next.reject(new DOMException("The search was cancelled.", "AbortError"));
      continue;
    }
    if (inFlight >= config.qlooMaxInFlight) return;
    const wait = lastRequestStartedAt + minIntervalMs() - Date.now();
    if (wait > 0) {
      pumpTimer = setTimeout(pumpSlotQueue, wait);
      return;
    }
    slotQueue.shift();
    inFlight += 1;
    lastRequestStartedAt = Date.now();
    next?.resolve();
  }
}

function acquireQlooSlot(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    slotQueue.push({ resolve, reject, signal });
    pumpSlotQueue();
  });
}

function releaseQlooSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  pumpSlotQueue();
}

// --- Monthly quota tracking --------------------------------------------------------------
// Qloo reports remaining monthly calls on an `x-month-ratelimit-remaining` response header;
// we remember the most recent value and use it to refuse new live runs before the key is
// exhausted (see isQuotaBelowFloor() and POST /api/runs).

let quotaRemaining: number | null = null;

/** Pure parse of the quota header value; `null` for a missing/non-numeric header. */
export function parseQuotaRemaining(headerValue: string | null): number | null {
  if (headerValue === null || headerValue.trim() === "") return null;
  const value = Number(headerValue);
  return Number.isFinite(value) ? value : null;
}

function updateQuotaFromHeaders(headers: Headers): void {
  const parsed = parseQuotaRemaining(headers.get("x-month-ratelimit-remaining"));
  if (parsed !== null) quotaRemaining = parsed;
}

/** Most recent `x-month-ratelimit-remaining` seen from Qloo, or `null` before any response
 * has reported it (e.g. on mock/snapshot providers, or before the first live call). */
export function getQlooQuotaRemaining(): number | null {
  return quotaRemaining;
}

/** Pure comparison, exported for unit testing; `isQuotaBelowFloor()` is the one routes use. */
export function isQuotaBelowFloorValue(remaining: number | null, floor: number): boolean {
  return remaining !== null && remaining < floor;
}

/** True once Qloo has reported fewer than `QLOO_MONTHLY_FLOOR` calls remaining this month. */
export function isQuotaBelowFloor(): boolean {
  return isQuotaBelowFloorValue(quotaRemaining, config.qlooMonthlyFloor);
}

export type QueryValue = string | number | boolean | undefined | null | Array<string | number>;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.map(String).join(","));
    } else {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The search was cancelled.", "AbortError"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Thin wrapper around a single `qlooGet` call: runs `perform()` (the actual fetch + retry
 * loop) and, regardless of outcome, appends one redacted `QlooCallRecord` to whatever call-log
 * sink is active for the current async context (see `./callLog.ts`) — a no-op outside a run
 * (e.g. in most unit tests). Cancelled requests (`AbortError`) are not logged as failures;
 * they're not a Qloo-side problem, just the user navigating away or a quiet-context timeout.
 */
async function withCallLog<T>(path: string, params: Record<string, QueryValue>, perform: () => Promise<T>): Promise<T> {
  const began = Date.now();
  try {
    const result = await perform();
    recordQlooCall({ path, params, status: "ok", ms: Date.now() - began });
    return result;
  } catch (error) {
    if (!isAbortError(error)) {
      recordQlooCall({ path, params, status: "error", ms: Date.now() - began, ...describeFailure(error) });
    }
    throw error;
  }
}

/** Why a call failed, for the call log: Qloo's HTTP status, or our own parse failure. */
function describeFailure(error: unknown): { httpStatus?: number; error: string } {
  if (error instanceof QlooHttpError) {
    const reason =
      error.status === 0 ? "network error" : error.status === 429 ? "rate limited" : error.status >= 500 ? "Qloo server error" : "rejected by Qloo";
    return { httpStatus: error.status, error: reason };
  }
  if (error instanceof Error && error.name === "ZodError") return { error: "unexpected response shape" };
  return { error: error instanceof Error ? error.message.slice(0, 80) : "unknown error" };
}

export async function qlooGet<T>(
  path: string,
  params: Record<string, QueryValue>,
  signal: AbortSignal | undefined,
  parse: (json: unknown) => T,
): Promise<T> {
  const key = config.qlooApiKey;
  if (!key) throw new Error("QLOO_API_KEY is missing.");
  assertCircuitClosed();
  recordUsage("qloo");

  const query = buildQuery(params);
  const url = `${config.qlooBaseUrl}${path.startsWith("/") ? path : `/${path}`}${query ? `?${query}` : ""}`;

  return withCallLog(path, params, async () => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      let response: Response;
      await acquireQlooSlot(signal);
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Api-Key": key,
          },
          signal,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        recordFailure();
        throw new QlooHttpError("Could not reach Qloo. Check your connection and try again.", 0);
      } finally {
        releaseQlooSlot();
      }
      updateQuotaFromHeaders(response.headers);

      if (response.status === 401) {
        throw new QlooHttpError(
          "Qloo rejected the API key. Use a hackathon key against https://hackathon.api.qloo.com.",
          401,
        );
      }
      if (response.status === 403) {
        throw new QlooHttpError("Qloo denied that entity type or parameter for this key.", 403);
      }
      if (response.status === 429) {
        if (attempt >= 5) {
          recordFailure();
          throw new QlooHttpError("Qloo rate limit hit. Wait a moment and try again.", 429);
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * attempt * attempt;
        await sleep(waitMs, signal);
        continue;
      }
      if (response.status === 404) {
        recordSuccess();
        return parse({ success: true, results: [] });
      }
      if (!response.ok) {
        let detail = response.statusText;
        try {
          const body = (await response.json()) as { message?: string; reason?: string };
          detail = body.message ?? body.reason ?? detail;
        } catch {
          // ignore
        }
        if (response.status >= 500) recordFailure();
        throw new QlooHttpError(`Qloo request failed (${response.status}): ${detail}`, response.status);
      }

      const json: unknown = await response.json();
      recordSuccess();
      return parse(json);
    }
  });
}

export async function searchEntities(
  params: Record<string, QueryValue>,
  signal?: AbortSignal,
): Promise<QlooEntity[]> {
  const parsed = await qlooGet("/search", params, signal, (json) => SearchResponseSchema.parse(json));
  return parsed.results ?? [];
}

export async function insights(
  params: Record<string, QueryValue>,
  signal?: AbortSignal,
): Promise<{ entities: QlooEntity[]; heatmap: Array<Record<string, unknown>>; raw: unknown }> {
  const raw = await qlooGet("/v2/insights", params, signal, (json) => InsightsResponseSchema.parse(json));
  return {
    entities: raw.results?.entities ?? [],
    heatmap: (raw.results?.heatmap ?? []) as Array<Record<string, unknown>>,
    raw,
  };
}

/** One tag from tag insights (`filter.type=urn:tag`), with the signal crowd's affinity to it. */
export interface TagAffinity {
  id: string;
  name: string;
  affinity: number;
}

/**
 * `GET /v2/insights` with `filter.type=urn:tag`: which taste tags the crowd behind `signal`
 * entities rates highest. Pass `filter.tag.types` to keep one vocabulary (e.g. lifestyle) and
 * `filter.results.tags` to score a fixed list of tags for a second crowd, which is how two
 * audiences are compared on the same tags.
 */
export async function tagInsights(params: Record<string, QueryValue>, signal?: AbortSignal): Promise<TagAffinity[]> {
  const parsed = await qlooGet("/v2/insights", { ...params, "filter.type": "urn:tag" }, signal, (json) =>
    InsightsResponseSchema.parse(json),
  );
  const tags = (parsed.results?.tags ?? []) as Array<Record<string, unknown>>;
  return tags
    .map((tag) => {
      const id = String(tag.tag_id ?? tag.id ?? "");
      const query = (tag.query ?? {}) as { affinity?: unknown };
      const affinity = typeof query.affinity === "number" && Number.isFinite(query.affinity) ? query.affinity : 0;
      return { id, name: String(tag.name ?? id).trim(), affinity: Math.max(0, Math.min(1, affinity)) };
    })
    .filter((tag) => tag.id.length > 0);
}

export async function searchTags(
  query: string,
  signal?: AbortSignal,
  opts?: { semantic?: boolean; take?: number },
): Promise<Array<{ id: string; name: string }>> {
  const parsed = await qlooGet(
    "/v2/tags",
    {
      "filter.query": query,
      take: opts?.take ?? 8,
      ...(opts?.semantic === false ? {} : { "feature.semantic_search": true }),
    },
    signal,
    (json) => TagsResponseSchema.parse(json),
  );
  return (parsed.results?.tags ?? [])
    .map((tag) => {
      const id = tag.tag_id ?? tag.id ?? "";
      return { id, name: tag.name ?? id };
    })
    .filter((tag) => tag.id.length > 0);
}

/**
 * `GET /v2/analysis/compare`: compares side A's and side B's signal entities, returning
 * (when non-empty) a `tags` array scoring each tag for both sides, plus `matchEntities`. The
 * hackathon probe found `tags` empty for its own `filter.type`; callers (`server/compare.ts`)
 * degrade to a computed tag intersection when that happens — see `docs/QLOO_CONTRACT_V2.md`.
 */
export async function compareEntities(
  aEntityIds: string[],
  bEntityIds: string[],
  signal?: AbortSignal,
): Promise<{ tags: Array<Record<string, unknown>>; matchEntities: Array<Record<string, unknown>>; raw: unknown }> {
  const raw = await qlooGet(
    "/v2/analysis/compare",
    {
      "a.signal.interests.entities": aEntityIds,
      "b.signal.interests.entities": bEntityIds,
      "filter.type": "urn:tag",
    },
    signal,
    (json) => CompareResponseSchema.parse(json),
  );
  return {
    tags: raw.results?.tags ?? [],
    matchEntities: raw.results?.matchEntities ?? [],
    raw,
  };
}

export function entityIdOf(entity: QlooEntity): string | undefined {
  return entity.entity_id ?? entity.id;
}

export function entityNameOf(entity: QlooEntity): string {
  return entity.name?.trim() || "Unknown";
}

export function affinityOf(entity: QlooEntity): number {
  const value = entity.affinity ?? entity.query?.affinity ?? 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function typesOf(entity: QlooEntity): string[] {
  if (Array.isArray(entity.types)) return entity.types;
  // Insights entities carry the generic `type: "urn:entity"` plus the specific `subtype`
  // (e.g. "urn:entity:place"); without the subtype every place was mislabelled as a brand.
  const out = Array.isArray(entity.type) ? [...entity.type] : typeof entity.type === "string" ? [entity.type] : [];
  if (typeof entity.subtype === "string") out.unshift(entity.subtype);
  return out;
}

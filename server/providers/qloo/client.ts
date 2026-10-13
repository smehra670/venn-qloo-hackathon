import { config } from "../../config.js";
import {
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

export async function qlooGet<T>(
  path: string,
  params: Record<string, QueryValue>,
  signal: AbortSignal | undefined,
  parse: (json: unknown) => T,
): Promise<T> {
  const key = config.qlooApiKey;
  if (!key) throw new Error("QLOO_API_KEY is missing.");
  assertCircuitClosed();

  const query = buildQuery(params);
  const url = `${config.qlooBaseUrl}${path.startsWith("/") ? path : `/${path}`}${query ? `?${query}` : ""}`;
  let attempt = 0;
  while (true) {
    attempt += 1;
    let response: Response;
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
      if (error instanceof Error && error.name === "AbortError") throw error;
      recordFailure();
      throw new QlooHttpError("Could not reach Qloo. Check your connection and try again.", 0);
    }

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

export async function searchTags(
  query: string,
  signal?: AbortSignal,
): Promise<Array<{ id: string; name: string }>> {
  const parsed = await qlooGet(
    "/v2/tags",
    { "filter.query": query, take: 8 },
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
  if (Array.isArray(entity.type)) return entity.type;
  if (typeof entity.type === "string") return [entity.type];
  return [];
}

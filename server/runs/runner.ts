import { STEP_TITLES } from "@shared/constants";
import type { PartnerKind, RunResult, StepId } from "@shared/types";
import { nanoid } from "nanoid";
import { getProvider } from "../providers/index.js";
import type { Candidate, ProviderContext } from "../providers/types.js";
import { matchCity } from "../providers/mock/cities.js";
import {
  chooseTopPicks,
  headlineFor,
  keepForKind,
  limitsFor,
  notesFor,
  cityFor,
  strongCount,
  widenKinds,
} from "../providers/mock/engine.js";
import { waitForLatency } from "./trace.js";
import { append, type Run } from "./store.js";

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function ensure(run: Run): void {
  if (run.abort.signal.aborted) throw new DOMException("The search was cancelled.", "AbortError");
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  results.length = items.length;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  if (items.length === 0) return [];
  await Promise.all(workers);
  return results;
}

export function executeRun(run: Run, log: (fields: Record<string, string | number>) => void): void {
  void pipeline(run, log);
}

async function pipeline(run: Run, log: (fields: Record<string, string | number>) => void): Promise<void> {
  const started = Date.now();
  const provider = getProvider();
  let step: StepId = "resolve";
  const ctx: ProviderContext = {
    signal: run.abort.signal,
    async trace(tool, args, fn, summarize) {
      ensure(run);
      run.toolCalls += 1;
      const callId = nanoid(8);
      append(run, { type: "tool_call", step, callId, tool, args });
      const began = Date.now();
      await waitForLatency(run.abort.signal);
      ensure(run);
      const value = await fn();
      append(run, {
        type: "tool_result",
        step,
        callId,
        tool,
        summary: summarize(value),
        ms: Date.now() - began,
      });
      return value;
    },
  };

  try {
    append(run, {
      type: "run_started",
      runId: run.id,
      provider: provider.name,
      providerLabel: provider.label,
    });

    step = "resolve";
    append(run, { type: "step_started", step, title: STEP_TITLES.resolve });
    const resolved = await provider.resolveAnchors(run.input, ctx);
    ensure(run);
    const matched = resolved.filter((item) => item.status === "matched").length;
    const keywords = resolved.filter((item) => item.status === "keyword").length;
    const guessed = resolved.filter((item) => item.status === "guessed").length;
    const resolveBits = [`Matched ${matched} of ${resolved.length}`];
    if (keywords > 0) resolveBits.push(`${keywords} read as ${keywords === 1 ? "an interest" : "interests"}`);
    if (guessed > 0) resolveBits.push(`${guessed} placed with a stand-in`);
    append(run, { type: "step_completed", step, summary: resolveBits.join(" · ") });

    step = "plan";
    append(run, { type: "step_started", step, title: STEP_TITLES.plan });
    const planned = await provider.planKinds(run.input, resolved, ctx);
    ensure(run);
    append(run, { type: "step_note", step, text: `Looking at: ${planned.join(", ")}.` });
    if (!matchCity(run.input.city)) {
      append(run, {
        type: "step_note",
        step,
        text: `No local places for ${run.input.city.trim()} in the demo set. Showing global brands and artists instead.`,
      });
    }
    append(run, { type: "step_completed", step, summary: `Will search ${planned.length} types.` });

    step = "discover";
    append(run, { type: "step_started", step, title: STEP_TITLES.discover });
    let pool = (
      await mapPool(planned, 3, async (kind, index) => {
        const found = await provider.discover(run.input, resolved, kind, ctx);
        return keepForKind(found, index);
      })
    ).flat();
    ensure(run);
    if (pool.length > 22) {
      pool = [...pool].sort((a, b) => b.provisional - a.provisional || a.entry.id.localeCompare(b.entry.id)).slice(0, 22);
    }
    append(run, {
      type: "step_completed",
      step,
      summary: `Found ${pool.length} candidates across ${planned.length} types.`,
    });

    step = "score";
    append(run, { type: "step_started", step, title: STEP_TITLES.score });
    let partners = await provider.score(run.input, resolved, pool, ctx);
    ensure(run);
    append(run, { type: "step_completed", step, summary: `Scored ${partners.length} partners.` });

    step = "enrich";
    append(run, { type: "step_started", step, title: STEP_TITLES.enrich });
    partners = await provider.enrich(run.input, partners, ctx);
    ensure(run);
    append(run, {
      type: "step_completed",
      step,
      summary: `Checked trends for ${Math.min(12, partners.length)} partners.`,
    });

    step = "adapt";
    append(run, { type: "step_started", step, title: STEP_TITLES.adapt });
    let retries = 0;
    const extra = widenKinds(run.input);
    const strong = strongCount(partners);
    if (strong < 12 && extra.length > 0) {
      retries = 1;
      append(run, {
        type: "retry",
        step,
        reason: `Only ${strong} strong matches. Widening to ${extra.join(" and ")} and relaxing the match threshold.`,
      });
      const widened = (
        await mapPool(extra, 2, async (kind) => {
          const found = await provider.discover(run.input, resolved, kind, ctx);
          return found.filter((candidate) => candidate.provisional >= 0.12).slice(0, 3);
        })
      ).flat();
      const seen = new Set(pool.map((candidate) => candidate.entry.id));
      const fresh = widened.filter((candidate) => !seen.has(candidate.entry.id));
      pool = [...pool, ...fresh];
      if (pool.length > 28) {
        pool = [...pool].sort((a, b) => b.provisional - a.provisional).slice(0, 28);
      }
      partners = await provider.score(run.input, resolved, pool, ctx);
      append(run, { type: "step_completed", step, summary: "Widened the search and scored again." });
    } else if (strong < 12) {
      append(run, { type: "step_note", step, text: "No further partner types to try." });
      append(run, { type: "step_completed", step, summary: "Kept the shortlist as it stands." });
    } else {
      append(run, { type: "step_note", step, text: "Coverage looks good. No need to widen the search." });
      append(run, { type: "step_completed", step, summary: "Coverage looks good." });
    }
    ensure(run);

    step = "assemble";
    append(run, { type: "step_started", step, title: STEP_TITLES.assemble });
    const topPicks = chooseTopPicks(partners);
    const elapsedMs = Date.now() - started;
    const result: RunResult = {
      runId: run.id,
      createdAt: run.createdAt,
      provider: provider.name,
      providerLabel: provider.label,
      input: run.input,
      resolvedAnchors: resolved,
      plannedKinds: searchedKinds(planned, extra, retries),
      partners,
      topPicks,
      city: cityFor(run.input),
      headline: headlineFor(partners, topPicks),
      notes: notesFor(run.input, resolved, retries),
      limits: limitsFor(run.input),
      stats: {
        candidatesConsidered: pool.length,
        retries,
        toolCalls: run.toolCalls,
        elapsedMs,
      },
    };
    append(run, { type: "step_completed", step, summary: "Your map is ready." });
    append(run, { type: "result", result });
    log({
      runId: run.id,
      provider: provider.name,
      businessType: run.input.businessType,
      city: run.input.city,
      anchorCount: run.input.anchors.length,
      elapsedMs,
    });
  } catch (error) {
    if (isAbort(error) || run.abort.signal.aborted) {
      if (run.status === "running") append(run, { type: "cancelled" });
      return;
    }
    log({
      runId: run.id,
      provider: provider.name,
      businessType: run.input.businessType,
      city: run.input.city,
      anchorCount: run.input.anchors.length,
      elapsedMs: Date.now() - started,
    });
    if (run.status === "running") {
      append(run, { type: "error", message: "The search stopped before it finished. Please try again." });
    }
  }
}

function searchedKinds(planned: PartnerKind[], extra: PartnerKind[], retries: number): PartnerKind[] {
  return retries > 0 ? [...planned, ...extra] : planned;
}

export type { Candidate };

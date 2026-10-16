import { DEMO_LIMITS, STEP_TITLES, UNKNOWN_CITY_LIMIT } from "@shared/constants";
import type { DecisionLogEntry, DecisionOrigin, DiscoverSpec, Normalization, PartnerKind, RunResult, StepId } from "@shared/types";
import { nanoid } from "nanoid";
import { applyCritiques, applyFeasibility, critiqueFeasibility, flaggedPartners } from "../agent/feasibility.js";
import { applyGoals, applyGoalsToKinds, filterByGoals, hasAnyGoal, rerankTopPicks, summarizeGoals } from "../agent/goals.js";
import { filterActionablePartners } from "../agent/reachable.js";
import { getProvider } from "../providers/index.js";
import { arraySink, withQlooCallSink, withQlooStep } from "../providers/qloo/callLog.js";
import { applyPopularityLift } from "../providers/taste-lift.js";
import type { Candidate, ProviderContext } from "../providers/types.js";
import {
  chooseTopPicks,
  headlineFor,
  keepForKind,
  limitsFor,
  notesFor,
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

export function executeRun(run: Run, log: (fields: Record<string, string | number>) => void): Promise<void> {
  const sink = arraySink(run.calls, () => nanoid(8));
  return withQlooCallSink(sink, () => pipeline(run, log));
}

async function pipeline(run: Run, log: (fields: Record<string, string | number>) => void): Promise<void> {
  const started = Date.now();
  const provider = getProvider({ live: run.live, input: run.input });
  let step: StepId = "resolve";
  const decisions: DecisionLogEntry[] = [];
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
      const value = await withQlooStep(step, fn);
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
    decide(decision, reason, meta) {
      ensure(run);
      const origin: DecisionOrigin = meta?.origin ?? "rule";
      const entry: DecisionLogEntry = { step, decision, reason, origin, kind: meta?.kind, subject: meta?.subject };
      decisions.push(entry);
      append(run, { type: "decision", step, decision, reason, origin, kind: meta?.kind, subject: meta?.subject });
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
    if (guessed > 0) resolveBits.push(`${guessed} kept as free-text interests`);
    append(run, { type: "step_completed", step, summary: resolveBits.join(" · ") });

    step = "plan";
    append(run, { type: "step_started", step, title: STEP_TITLES.plan });
    const plannedRaw = await provider.planKinds(run.input, resolved, ctx);
    ensure(run);
    const planned = applyGoalsToKinds(plannedRaw, run.input.goals);
    const city = await provider.resolveCity(run.input, ctx);
    ensure(run);
    append(run, { type: "step_note", step, text: `Looking at: ${planned.join(", ")}.` });
    if (!city?.hasLocalData) {
      append(run, {
        type: "step_note",
        step,
        text: `No local geography for ${run.input.city.trim()}. Showing broader brands and artists instead.`,
      });
    }
    if (hasAnyGoal(run.input.goals)) {
      ctx.decide("Noted your fine-tune preferences", summarizeGoals(run.input.goals), { origin: "rule" });
      if (planned.join(",") !== plannedRaw.join(",")) {
        ctx.decide(
          "Reordered search types for your goals",
          `Looked at ${planned.join(", ")} first, prioritised by what you want from a collaboration.`,
          { origin: "rule" },
        );
      }
    }
    append(run, { type: "step_completed", step, summary: `Will search ${planned.length} types.` });

    step = "discover";
    append(run, { type: "step_started", step, title: STEP_TITLES.discover });
    const discoverSpecs: DiscoverSpec[] = [];
    let pool = (
      await mapPool(planned, provider.name === "qloo" ? 2 : 3, async (kind, index) => {
        const specOut: { spec?: DiscoverSpec } = {};
        const found = await provider.discover(run.input, resolved, kind, ctx, specOut);
        if (specOut.spec) discoverSpecs.push(specOut.spec);
        return keepForKind(found, index);
      })
    ).flat();
    ensure(run);
    if (pool.length > 22) {
      ctx.decide(
        "Trimmed the candidate pool",
        `Found ${pool.length} candidates; kept the strongest 22 by provisional fit to stay within budget.`,
        { origin: "qloo" },
      );
      pool = [...pool].sort((a, b) => b.provisional - a.provisional || a.entry.id.localeCompare(b.entry.id)).slice(0, 22);
    }
    append(run, {
      type: "step_completed",
      step,
      summary: `Found ${pool.length} candidates across ${planned.length} types.`,
    });

    step = "score";
    append(run, { type: "step_started", step, title: STEP_TITLES.score });
    const scoreOut: { normalization?: Normalization } = {};
    let partners = await provider.score(run.input, resolved, pool, ctx, scoreOut);
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
      const retryReason = `Only ${strong} strong matches. Widening to ${extra.join(" and ")} and relaxing the match threshold.`;
      append(run, { type: "retry", step, reason: retryReason });
      ctx.decide("Widened the search", retryReason, { origin: "qloo" });
      const widened = (
        await mapPool(extra, 2, async (kind) => {
          const specOut: { spec?: DiscoverSpec } = {};
          const found = await provider.discover(run.input, resolved, kind, ctx, specOut);
          if (specOut.spec) discoverSpecs.push(specOut.spec);
          return found.filter((candidate) => candidate.provisional >= 0.12).slice(0, 3);
        })
      ).flat();
      const seen = new Set(pool.map((candidate) => candidate.entry.id));
      const fresh = widened.filter((candidate) => !seen.has(candidate.entry.id));
      pool = [...pool, ...fresh];
      if (pool.length > 28) {
        pool = [...pool].sort((a, b) => b.provisional - a.provisional).slice(0, 28);
      }
      partners = await provider.score(run.input, resolved, pool, ctx, scoreOut);
      append(run, { type: "step_completed", step, summary: "Widened the search and scored again." });
    } else if (strong < 12) {
      append(run, { type: "step_note", step, text: "No further partner types to try." });
      append(run, { type: "step_completed", step, summary: "Kept the shortlist as it stands." });
      ctx.decide(
        "Kept the shortlist as it stands",
        `Only ${strong} strong matches, but no further partner types were left to try.`,
        { origin: "rule" },
      );
    } else {
      append(run, { type: "step_note", step, text: "Coverage looks good. No need to widen the search." });
      append(run, { type: "step_completed", step, summary: "Coverage looks good." });
      ctx.decide("Did not widen the search", `${strong} strong matches already — coverage looked solid after the first pass.`, {
        origin: "rule",
      });
    }
    ensure(run);

    step = "assemble";
    append(run, { type: "step_started", step, title: STEP_TITLES.assemble });
    partners = applyGoals(partners, run.input.goals);
    const goalFilter = filterByGoals(partners, run.input.goals);
    partners = goalFilter.partners;
    if (goalFilter.note) ctx.decide("Filtered partners for your goals", goalFilter.note, { origin: "rule" });

    // Prefer places and brands you can visit or pitch — drop media networks, distant clubs, etc.
    const actionable = filterActionablePartners(partners, run.input.goals, {
      hasLocalGeography: Boolean(city?.hasLocalData),
      reach: run.input.goals?.reach,
    });
    partners = actionable.partners;
    if (actionable.note) {
      ctx.decide("Kept reachable partners only", actionable.note, { origin: "rule" });
    }

    let topPicks = chooseTopPicks(partners);
    const goalRerank = rerankTopPicks(partners, topPicks, run.input.goals);
    topPicks = goalRerank.topPicks;
    for (const note of goalRerank.notes) ctx.decide("Adjusted a top pick for your preferences", note, { origin: "rule" });

    partners = partners.map((partner) => ({ ...partner, origin: partner.userAdded ? "user_added" : "discovered" }));
    partners = applyFeasibility(partners, topPicks, run.input);
    const flagged = flaggedPartners(partners, topPicks);
    if (flagged.length > 0) {
      ctx.decide(
        "Flagged a feasibility concern",
        `${flagged.length} of your top picks have a note worth checking before reaching out: ${flagged.map((partner) => partner.name).join(", ")}.`,
        { origin: "rule" },
      );
    }
    const critiques = await critiqueFeasibility(flagged);
    if (critiques.length > 0) {
      partners = applyCritiques(partners, critiques);
      for (const critique of critiques) {
        const partner = partners.find((item) => item.id === critique.partnerId);
        ctx.decide("AI critique adjusted a feasibility tier", critique.reason, {
          origin: "ai",
          kind: partner?.kind,
          subject: partner?.name,
        });
      }
    }

    partners = applyPopularityLift(partners);

    const elapsedMs = Date.now() - started;
    const limits =
      provider.name === "mock"
        ? limitsFor(run.input)
        : [
            "Match scores are relative to this search and describe group-level taste, not individuals.",
            "Partner ideas come from Qloo Insights. Briefs are templates — check them before you send one.",
            ...(city?.hasLocalData ? [] : [UNKNOWN_CITY_LIMIT]),
          ];
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
      city,
      headline: headlineFor(partners, topPicks),
      notes:
        critiques.length > 0
          ? [...notesFor(run.input, resolved, retries), `Agent critique: ${critiques.map((item) => item.reason).join(" ")}`]
          : notesFor(run.input, resolved, retries),
      limits: provider.name === "mock" ? limits : limits.length > 0 ? limits : [...DEMO_LIMITS],
      stats: {
        candidatesConsidered: pool.length,
        retries,
        toolCalls: run.toolCalls,
        elapsedMs,
      },
      normalization: scoreOut.normalization,
      decisions,
      discoverSpecs,
      calls: [...run.calls],
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
    const detail = error instanceof Error ? error.message : "unknown error";
    log({
      runId: run.id,
      provider: provider.name,
      businessType: run.input.businessType,
      city: run.input.city,
      anchorCount: run.input.anchors.length,
      elapsedMs: Date.now() - started,
      error: detail,
    });
    if (run.status === "running") {
      const friendly =
        detail.includes("Qloo") || detail.includes("rate limit") || detail.includes("API key")
          ? detail
          : "The search stopped before it finished. Please try again.";
      append(run, { type: "error", message: friendly });
    }
  }
}

function searchedKinds(planned: PartnerKind[], extra: PartnerKind[], retries: number): PartnerKind[] {
  return retries > 0 ? [...planned, ...extra] : planned;
}

export type { Candidate };

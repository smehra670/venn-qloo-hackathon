/**
 * Visual-only fixtures for Playwright research screenshots.
 * Does not touch SSE, ranking, or live research logic — only seeds UI state.
 */
import { STEP_TITLES } from "@shared/constants";
import { STEP_ORDER, type AgentEvent, type BusinessInput, type Partner, type RunResult, type StepId, type StoredEvent } from "@shared/types";

const LONDON: [number, number] = [51.5074, -0.1278];

const INPUT: BusinessInput = {
  businessName: "Brew & Co",
  businessType: "cafe",
  city: "London",
  anchors: ["Jazz Music", "Food"],
};

function basePartner(
  partial: Pick<Partner, "id" | "name" | "kind" | "matchScore"> & {
    lat?: number;
    lon?: number;
    closed?: boolean;
    popularityLift?: number;
  },
): Partner {
  const { lat, lon, closed, popularityLift, ...rest } = partial;
  return {
    ...rest,
    entityType: lat != null ? "place" : "brand",
    blurb: closed ? "Permanently closed record shop." : "A local partner with overlapping taste.",
    local: lat != null,
    locationLabel: lat != null ? "London" : undefined,
    surprise: 0.2,
    isSurprising: false,
    reasons: ["Shared jazz affinity"],
    sharedTags: ["jazz"],
    tags: ["jazz"],
    signals: {
      affinityToPartner: rest.matchScore / 100,
      affinityFromPartner: (rest.matchScore / 100) * 0.9,
      tagOverlap: 0.4,
      localPopularity: 0.5,
      trend: 0.3,
    },
    evidence: [],
    relatedIds: [],
    popularityLift,
    venueFacts:
      lat != null && lon != null
        ? { lat, lon, address: "London", distanceM: 1200 }
        : undefined,
  };
}

/** Sample London partners near the city centre (real-ish offsets, not invented brands-as-places). */
export const SHOT_PARTNERS: Partner[] = [
  basePartner({ id: "spin", name: "Spin Cycle Records", kind: "music", matchScore: 91, lat: 51.513, lon: -0.135, popularityLift: 0.22 }),
  basePartner({ id: "quiet", name: "Quiet Hours Yoga", kind: "wellness", matchScore: 86, lat: 51.52, lon: -0.11, popularityLift: 0.18 }),
  basePartner({ id: "folio", name: "Folio Books", kind: "culture", matchScore: 82, lat: 51.515, lon: -0.122, popularityLift: 0.12 }),
  basePartner({ id: "owl", name: "Night Owl Records", kind: "music", matchScore: 79, lat: 51.505, lon: -0.12, popularityLift: 0.08 }),
  basePartner({ id: "marlow", name: "Marlow & Pine", kind: "retail", matchScore: 74, lat: 51.508, lon: -0.14 }),
  basePartner({ id: "hearth", name: "Hearth Bakery", kind: "food", matchScore: 71, lat: 51.498, lon: -0.128 }),
  basePartner({ id: "field", name: "Field Notes Studio", kind: "culture", matchScore: 68, lat: 51.522, lon: -0.125 }),
  basePartner({ id: "common", name: "Common Room Fitness", kind: "fitness", matchScore: 63, lat: 51.518, lon: -0.145 }),
  basePartner({ id: "paper", name: "Paper Tiger Print", kind: "retail", matchScore: 55, lat: 51.511, lon: -0.138, closed: true }),
  basePartner({ id: "ember", name: "Ember Ceramics", kind: "culture", matchScore: 50, lat: 51.525, lon: -0.118, closed: true }),
  basePartner({ id: "brand-a", name: "Blue Note UK", kind: "music", matchScore: 72 }),
  basePartner({ id: "brand-b", name: "Resident Advisor", kind: "music", matchScore: 64 }),
];

export type ResearchShotScenario = "default" | "zero" | "unknown-city";

export interface ResearchShotConfig {
  step: StepId;
  scenario: ResearchShotScenario;
  /** When true, show finished assemble state (reduced-motion / done). */
  done?: boolean;
  /** Visual elapsed ms within the active step (defaults to mid-step for screenshots). */
  elapsedMs?: number;
}

function eventsThrough(active: StepId, withPartners: boolean): StoredEvent[] {
  const idx = STEP_ORDER.indexOf(active);
  const out: StoredEvent[] = [];
  let id = 1;
  const at = Date.now() - 60_000;
  out.push({
    id: id++,
    at,
    type: "run_started",
    runId: "shot-run",
    provider: "mock",
    providerLabel: "Mock",
  });

  for (let i = 0; i <= idx; i++) {
    const step = STEP_ORDER[i]!;
    const t = at + i * 2000;
    out.push({ id: id++, at: t, type: "step_started", step, title: STEP_TITLES[step] });
    if (step === "plan") {
      out.push({
        id: id++,
        at: t + 100,
        type: "step_note",
        step,
        text: "Looking at: Music, Culture, Retail, Fitness, Wellness.",
      });
      out.push({
        id: id++,
        at: t + 200,
        type: "tool_call",
        step,
        callId: "c-plan",
        tool: "tags",
        args: "cafe, London",
      });
      out.push({
        id: id++,
        at: t + 500,
        type: "tool_result",
        step,
        callId: "c-plan",
        tool: "tags",
        summary: "5 kinds chosen",
        ms: 515,
      });
    }
    if (step === "discover" && withPartners) {
      out.push({
        id: id++,
        at: t + 200,
        type: "tool_call",
        step,
        callId: "c-disc",
        tool: "insights",
        args: "5 kinds near London",
      });
      out.push({
        id: id++,
        at: t + 800,
        type: "tool_result",
        step,
        callId: "c-disc",
        tool: "insights",
        summary: "12 places found",
        ms: 1200,
      });
    }
    if (step === "resolve") {
      out.push({
        id: id++,
        at: t + 100,
        type: "tool_call",
        step,
        callId: "c-j",
        tool: "search",
        args: "Jazz Music",
      });
      out.push({
        id: id++,
        at: t + 400,
        type: "tool_result",
        step,
        callId: "c-j",
        tool: "search",
        summary: "1 topic and 5 names matched",
        ms: 412,
      });
      out.push({
        id: id++,
        at: t + 500,
        type: "tool_call",
        step,
        callId: "c-f",
        tool: "search",
        args: "Food",
      });
      out.push({
        id: id++,
        at: t + 700,
        type: "tool_result",
        step,
        callId: "c-f",
        tool: "search",
        summary: "matched as a topic",
        ms: 301,
      });
    }
    if (i < idx) {
      out.push({
        id: id++,
        at: t + 1500,
        type: "step_completed",
        step,
        summary: STEP_TITLES[step],
      });
    }
  }
  return out;
}

function buildResult(scenario: Exclude<ResearchShotScenario, "unknown-city">): RunResult {
  const partners = scenario === "zero" ? [] : SHOT_PARTNERS;
  const roles = ["best_overall", "best_local", "wildcard", "wildcard", "wildcard"] as const;
  return {
    runId: "shot-run",
    createdAt: Date.now(),
    provider: "mock",
    providerLabel: "Mock",
    input: INPUT,
    resolvedAnchors: INPUT.anchors.map((a) => ({
      input: a,
      status: "matched" as const,
      tags: [a.toLowerCase()],
      note: "matched",
    })),
    plannedKinds: ["music", "culture", "retail", "fitness", "wellness"],
    partners,
    topPicks: partners
      .filter((p) => p.venueFacts)
      .slice(0, 5)
      .map((p, i) => ({
        role: roles[i] ?? "wildcard",
        partnerId: p.id,
        headline: p.name,
      })),
    city: {
      name: "London",
      center: LONDON,
      zoom: 12,
      hasLocalData: true,
    },
    headline: "Crowds like yours",
    notes: [],
    limits: [],
    stats: { candidatesConsidered: partners.length, retries: 0, toolCalls: 4, elapsedMs: 8000 },
  };
}

/** Seed payload for `useVenn.setState` — visuals only. */
export function researchShotState(config: ResearchShotConfig): {
  stage: "researching";
  input: BusinessInput;
  events: StoredEvent[];
  result: RunResult | null;
  settling: boolean;
  error: null;
  runId: string;
} {
  const { step, scenario, done } = config;
  const input: BusinessInput =
    scenario === "unknown-city"
      ? { ...INPUT, city: "Atlantis" }
      : INPUT;
  const pastDiscover = STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf("discover");
  const withPartners = scenario === "default" && pastDiscover;
  const events = eventsThrough(done ? "assemble" : step, withPartners);
  // Zero-results still needs a discover tool pair so the Qloo card and step sub-line stay honest.
  if (scenario === "zero" && pastDiscover) {
    const t = Date.now();
    events.push(
      {
        id: events.length + 1,
        at: t,
        type: "tool_call",
        step: "discover",
        callId: "c-disc-zero",
        tool: "insights",
        args: "5 kinds near London",
      },
      {
        id: events.length + 2,
        at: t + 400,
        type: "tool_result",
        step: "discover",
        callId: "c-disc-zero",
        tool: "insights",
        summary: "0 places found",
        ms: 380,
      },
    );
  }
  const result =
    scenario === "unknown-city"
      ? null
      : done || pastDiscover
        ? buildResult(scenario)
        : null;

  if (done && result) {
    events.push({
      id: events.length + 1,
      at: Date.now(),
      type: "step_completed",
      step: "assemble",
      summary: "Ready",
    } satisfies StoredEvent & AgentEvent);
    events.push({
      id: events.length + 2,
      at: Date.now() + 1,
      type: "result",
      result,
    });
  }

  return {
    stage: "researching",
    input,
    events,
    result,
    settling: Boolean(done),
    error: null,
    runId: "shot-run",
  };
}

export function parseResearchShotHash(hash: string): ResearchShotConfig | null {
  if (!hash.startsWith("#research-shot")) return null;
  const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const params = new URLSearchParams(q);
  const step = (params.get("step") ?? "resolve") as StepId;
  if (!STEP_ORDER.includes(step)) return null;
  const scenario = (params.get("scenario") ?? "default") as ResearchShotScenario;
  if (!["default", "zero", "unknown-city"].includes(scenario)) return null;
  const elapsedRaw = params.get("t");
  const elapsedMs = elapsedRaw != null && elapsedRaw !== "" ? Number(elapsedRaw) : undefined;
  return {
    step,
    scenario,
    done: params.get("done") === "1",
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : undefined,
  };
}

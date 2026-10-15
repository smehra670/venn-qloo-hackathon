import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const blankToUndefined = (value: unknown): unknown => {
  if (value === undefined || value === "") return undefined;
  return value;
};

const EnvSchema = z.object({
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(8787)),
  HOST: z.preprocess(blankToUndefined, z.string().min(1).default("0.0.0.0")),
  NODE_ENV: z.preprocess(
    blankToUndefined,
    z.enum(["development", "production", "test"]).default("development"),
  ),
  TASTE_PROVIDER: z.preprocess(blankToUndefined, z.enum(["mock", "qloo", "snapshot"]).default("mock")),
  MOCK_LATENCY: z.preprocess(blankToUndefined, z.enum(["normal", "fast", "off"]).default("normal")),
  TRUST_PROXY: z.preprocess(blankToUndefined, z.enum(["true", "false", "1", "0"]).default("false")),
  RATE_LIMIT_MAX: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(120)),
  RATE_LIMIT_RUNS_PER_MIN: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(8)),
  QLOO_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  QLOO_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().default("https://hackathon.api.qloo.com"),
  ),
  QLOO_CIRCUIT_FAILURES: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(5)),
  QLOO_CIRCUIT_COOLDOWN_MS: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(30_000)),
  // Client-side pacing: caps outbound request rate/concurrency so a burst of runs can't blow
  // through the hackathon key's monthly quota in a few minutes.
  QLOO_MAX_RPS: z.preprocess(blankToUndefined, z.coerce.number().positive().default(4)),
  QLOO_MAX_IN_FLIGHT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(3)),
  // Below this many calls remaining in the current Qloo billing month, new live runs are
  // refused (see isQuotaBelowFloor()/POST /api/runs) so the key survives through judging.
  QLOO_MONTHLY_FLOOR: z.preprocess(blankToUndefined, z.coerce.number().int().nonnegative().default(500)),

  // PROOF_MAX_CALLS is defined above (near LLM_BRIEF_BUDGET_PER_RUN) alongside the
  // rankTogether-based Proof budget. COMPARE_MAX_CALLS_PER_RUN is a matching soft cap for
  // Compare; Compare is currently computed from a run's existing signals with no extra Qloo
  // calls, so this is a forward-looking budget.
  COMPARE_MAX_CALLS_PER_RUN: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(10)),

  // snapshot (default): replay example searches from disk even when TASTE_PROVIDER is mock/qloo,
  // saving quota during judging. live: always use TASTE_PROVIDER's own provider. See
  // getProvider() in providers/index.ts and the `live` flag on POST /api/runs.
  EXAMPLES_MODE: z.preprocess(blankToUndefined, z.enum(["snapshot", "live"]).default("snapshot")),

  PUBLIC_REPO_URL: z.preprocess(blankToUndefined, z.string().min(1).optional()),

  DATA_DIR: z.preprocess(blankToUndefined, z.string().min(1).default("./data")),
  RUN_TTL_HOURS: z.preprocess(blankToUndefined, z.coerce.number().positive().default(24)),
  // Optional day-based aliases; when present they override the *_HOURS defaults above.
  RUN_TTL_DAYS: z.preprocess(blankToUndefined, z.coerce.number().positive().optional()),
  SHARE_TTL_HOURS: z.preprocess(blankToUndefined, z.coerce.number().positive().default(168)),
  SHARE_TTL_DAYS: z.preprocess(blankToUndefined, z.coerce.number().positive().optional()),
  MAX_CONCURRENT_RUNS: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(2)),
  QUEUE_MAX: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(20)),
  DAILY_RUN_CAP_PER_IP: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(40)),
  SNAPSHOT_DIR: z.preprocess(blankToUndefined, z.string().min(1).default("./snapshots")),
  APP_SALT: z.preprocess(blankToUndefined, z.string().min(1).default("venn-hackathon-fixed-salt")),

  LLM_PROVIDER: z.preprocess(
    blankToUndefined,
    z.enum(["openai", "anthropic", "none", "fake", "empty"]).default("none"),
  ),
  OPENAI_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  ANTHROPIC_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  LLM_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  LLM_MODEL: z.preprocess(blankToUndefined, z.string().min(1).default("gpt-4.1-mini")),
  LLM_MODEL_FAST: z.preprocess(blankToUndefined, z.string().min(1).default("gpt-4.1-mini")),
  LLM_BRIEF_BUDGET_PER_RUN: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(6)),
  /** Max `rankTogether` calls (one per kind, plus any baseline-name resolutions) a single
   * Proof build may make, so a search with many kinds can't blow the Qloo call budget. */
  PROOF_MAX_CALLS: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(6)),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment: ${detail}`);
}

if (parsed.data.TASTE_PROVIDER === "qloo" && !parsed.data.QLOO_API_KEY) {
  throw new Error("TASTE_PROVIDER=qloo requires QLOO_API_KEY. Set the key in .env or use TASTE_PROVIDER=mock.");
}

// Fail loudly at boot rather than silently falling back to a different (or no) provider.
// Skipped only under NODE_ENV=test so the suite can exercise every LLM_PROVIDER value
// without a real key; `getLlm()` carries the same check as a second line of defense.
if (parsed.data.NODE_ENV !== "test") {
  if (parsed.data.LLM_PROVIDER === "openai" && !(parsed.data.OPENAI_API_KEY || parsed.data.LLM_API_KEY)) {
    throw new Error(
      "LLM_PROVIDER=openai requires OPENAI_API_KEY (or LLM_API_KEY). Set the key in .env, or switch LLM_PROVIDER to none.",
    );
  }
  if (parsed.data.LLM_PROVIDER === "anthropic" && !(parsed.data.ANTHROPIC_API_KEY || parsed.data.LLM_API_KEY)) {
    throw new Error(
      "LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY (or LLM_API_KEY). Set the key in .env, or switch LLM_PROVIDER to none.",
    );
  }
}

const resolvedLlmApiKey =
  parsed.data.LLM_PROVIDER === "anthropic"
    ? parsed.data.ANTHROPIC_API_KEY || parsed.data.LLM_API_KEY
    : parsed.data.OPENAI_API_KEY || parsed.data.LLM_API_KEY;

export const config = {
  port: parsed.data.PORT,
  host: parsed.data.HOST,
  nodeEnv: parsed.data.NODE_ENV,
  tasteProvider: parsed.data.TASTE_PROVIDER,
  mockLatency: parsed.data.MOCK_LATENCY,
  trustProxy: parsed.data.TRUST_PROXY === "true" || parsed.data.TRUST_PROXY === "1",
  rateLimitMax: parsed.data.RATE_LIMIT_MAX,
  rateLimitRunsPerMin: parsed.data.RATE_LIMIT_RUNS_PER_MIN,
  qlooApiKey: parsed.data.QLOO_API_KEY,
  qlooBaseUrl: parsed.data.QLOO_BASE_URL.replace(/\/$/, ""),
  qlooCircuitFailures: parsed.data.QLOO_CIRCUIT_FAILURES,
  qlooCircuitCooldownMs: parsed.data.QLOO_CIRCUIT_COOLDOWN_MS,
  qlooMaxRps: parsed.data.QLOO_MAX_RPS,
  qlooMaxInFlight: parsed.data.QLOO_MAX_IN_FLIGHT,
  qlooMonthlyFloor: parsed.data.QLOO_MONTHLY_FLOOR,

  // proofMaxCalls is set below, alongside the other rankTogether/Proof-budget fields.
  compareMaxCallsPerRun: parsed.data.COMPARE_MAX_CALLS_PER_RUN,

  examplesMode: parsed.data.EXAMPLES_MODE,
  publicRepoUrl: parsed.data.PUBLIC_REPO_URL,

  dataDir: parsed.data.DATA_DIR,
  runTtlHours: parsed.data.RUN_TTL_DAYS !== undefined ? parsed.data.RUN_TTL_DAYS * 24 : parsed.data.RUN_TTL_HOURS,
  shareTtlHours:
    parsed.data.SHARE_TTL_DAYS !== undefined ? parsed.data.SHARE_TTL_DAYS * 24 : parsed.data.SHARE_TTL_HOURS,
  maxConcurrentRuns: parsed.data.MAX_CONCURRENT_RUNS,
  queueMax: parsed.data.QUEUE_MAX,
  dailyRunCapPerIp: parsed.data.DAILY_RUN_CAP_PER_IP,
  snapshotDir: parsed.data.SNAPSHOT_DIR,
  appSalt: parsed.data.APP_SALT,

  llmProvider: parsed.data.LLM_PROVIDER,
  llmApiKey: resolvedLlmApiKey,
  llmModel: parsed.data.LLM_MODEL,
  llmModelFast: parsed.data.LLM_MODEL_FAST,
  llmBriefBudgetPerRun: parsed.data.LLM_BRIEF_BUDGET_PER_RUN,
  proofMaxCalls: parsed.data.PROOF_MAX_CALLS,
};

export type AppConfig = typeof config;

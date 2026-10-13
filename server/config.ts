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

  DATA_DIR: z.preprocess(blankToUndefined, z.string().min(1).default("./data")),
  RUN_TTL_HOURS: z.preprocess(blankToUndefined, z.coerce.number().positive().default(24)),
  MAX_CONCURRENT_RUNS: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(2)),
  QUEUE_MAX: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(20)),
  DAILY_RUN_CAP_PER_IP: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(40)),
  SNAPSHOT_DIR: z.preprocess(blankToUndefined, z.string().min(1).default("./snapshots")),
  APP_SALT: z.preprocess(blankToUndefined, z.string().min(1).default("venn-hackathon-fixed-salt")),

  LLM_PROVIDER: z.preprocess(blankToUndefined, z.enum(["openai", "none", "fake", "empty"]).default("none")),
  OPENAI_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  LLM_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  LLM_MODEL: z.preprocess(blankToUndefined, z.string().min(1).default("gpt-4.1-mini")),
  LLM_MODEL_FAST: z.preprocess(blankToUndefined, z.string().min(1).default("gpt-4.1-mini")),
  LLM_BRIEF_BUDGET_PER_RUN: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(6)),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment: ${detail}`);
}

if (parsed.data.TASTE_PROVIDER === "qloo" && !parsed.data.QLOO_API_KEY) {
  throw new Error("TASTE_PROVIDER=qloo requires QLOO_API_KEY. Set the key in .env or use TASTE_PROVIDER=mock.");
}

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

  dataDir: parsed.data.DATA_DIR,
  runTtlHours: parsed.data.RUN_TTL_HOURS,
  maxConcurrentRuns: parsed.data.MAX_CONCURRENT_RUNS,
  queueMax: parsed.data.QUEUE_MAX,
  dailyRunCapPerIp: parsed.data.DAILY_RUN_CAP_PER_IP,
  snapshotDir: parsed.data.SNAPSHOT_DIR,
  appSalt: parsed.data.APP_SALT,

  llmProvider: parsed.data.LLM_PROVIDER,
  llmApiKey: parsed.data.OPENAI_API_KEY || parsed.data.LLM_API_KEY,
  llmModel: parsed.data.LLM_MODEL,
  llmModelFast: parsed.data.LLM_MODEL_FAST,
  llmBriefBudgetPerRun: parsed.data.LLM_BRIEF_BUDGET_PER_RUN,
};

export type AppConfig = typeof config;

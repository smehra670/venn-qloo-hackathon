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
  TASTE_PROVIDER: z.preprocess(blankToUndefined, z.enum(["mock", "qloo"]).default("mock")),
  MOCK_LATENCY: z.preprocess(blankToUndefined, z.enum(["normal", "fast", "off"]).default("normal")),
  TRUST_PROXY: z.preprocess(blankToUndefined, z.enum(["true", "false", "1", "0"]).default("false")),
  RATE_LIMIT_MAX: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(120)),
  RATE_LIMIT_RUNS_PER_MIN: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(8)),
  QLOO_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  QLOO_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().default("https://hackathon.api.qloo.com"),
  ),
  LLM_PROVIDER: z.preprocess(blankToUndefined, z.string().optional()),
  LLM_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
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
  llmProvider: parsed.data.LLM_PROVIDER,
  llmApiKey: parsed.data.LLM_API_KEY,
};

export type AppConfig = typeof config;

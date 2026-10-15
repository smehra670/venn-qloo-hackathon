import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import { BUSINESS_TYPES } from "@shared/types";
import type { FastifyInstance } from "fastify";
import { accessSync, constants as fsConstants, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { EXAMPLES } from "../examples.js";
import { isLlmEnabled } from "../llm/index.js";
import { getProvider } from "../providers/index.js";
import { getCircuitState, getQlooQuotaRemaining } from "../providers/qloo/client.js";
import { hashInput } from "../providers/snapshot/hash.js";
import { loadManifest } from "../providers/snapshot/manifest.js";
import { getScheduler } from "../runs/scheduler.js";
import { getStoreStats } from "../runs/store.js";
import { getUsageHistory, getUsageSummary } from "../usage/ledger.js";

export { EXAMPLES };

function readPackageJson(): Record<string, unknown> {
  try {
    const raw = readFileSync(path.resolve(process.cwd(), "package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function version(): string {
  const field = readPackageJson().version;
  return typeof field === "string" ? field : "0.1.0";
}

function license(): string | null {
  const field = readPackageJson().license;
  return typeof field === "string" ? field : null;
}

function dataDirOk(): boolean {
  try {
    const dir = path.resolve(process.cwd(), config.dataDir);
    mkdirSync(dir, { recursive: true });
    accessSync(dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function registerHealth(app: FastifyInstance): void {
  app.get("/api/health", async () => {
    const provider = getProvider();
    const scheduler = getScheduler();
    return {
      ok: true as const,
      provider: provider.name,
      providerLabel: provider.label,
      demo: provider.name === "mock",
      version: version(),
      queue: scheduler.status(),
      circuit: getCircuitState(),
      store: getStoreStats(),
      llm: { enabled: isLlmEnabled(), provider: config.llmProvider },
      dataDir: { path: config.dataDir, ok: dataDirOk() },
      usage: getUsageSummary(),
      qlooQuotaRemaining: getQlooQuotaRemaining(),
      examplesMode: config.examplesMode,
    };
  });

  app.get("/api/usage", async () => ({
    ...getUsageSummary(),
    history: getUsageHistory(),
  }));

  app.get("/api/meta", async () => ({
    businessTypes: BUSINESS_TYPES.map((id) => ({ id, label: BUSINESS_TYPE_LABELS[id] })),
    demoCities: ["London", "Manchester", "New York"],
    examples: EXAMPLES,
    latency: config.mockLatency,
    publicRepoUrl: config.publicRepoUrl ?? null,
    license: license(),
  }));

  app.get("/api/examples", async () => {
    const manifest = loadManifest();
    const byHash = new Map(manifest.map((entry) => [entry.hash, entry]));
    return {
      examples: EXAMPLES.map((example, index) => {
        const hash = hashInput(example);
        const snapshot = byHash.get(hash);
        return {
          ...example,
          snapshot: snapshot
            ? { available: true, date: snapshot.date, provider: snapshot.provider }
            : { available: false, date: null, provider: null },
          index,
        };
      }),
    };
  });
}

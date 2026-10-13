import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import { BUSINESS_TYPES, type ExampleInput } from "@shared/types";
import type { FastifyInstance } from "fastify";
import { accessSync, constants as fsConstants, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { isLlmEnabled } from "../llm/index.js";
import { getProvider } from "../providers/index.js";
import { getCircuitState } from "../providers/qloo/client.js";
import { hashInput } from "../providers/snapshot/hash.js";
import { loadManifest } from "../providers/snapshot/manifest.js";
import { getScheduler } from "../runs/scheduler.js";
import { getStoreStats } from "../runs/store.js";

export const EXAMPLES: ExampleInput[] = [
  { businessType: "cafe", city: "London", anchors: ["Aesop", "Radiohead", "pilates"], businessName: "Brew & Co" },
  { businessType: "gym_studio", city: "Manchester", anchors: ["Patagonia", "craft beer", "bouldering"] },
  { businessType: "retail_shop", city: "New York", anchors: ["Bandcamp", "Polaroid", "natural wine"], businessName: "Second Spin Records" },
];

function version(): string {
  try {
    const raw = readFileSync(path.resolve(process.cwd(), "package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "version" in parsed && typeof parsed.version === "string") {
      return parsed.version;
    }
  } catch {
    return "0.1.0";
  }
  return "0.1.0";
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
    };
  });

  app.get("/api/meta", async () => ({
    businessTypes: BUSINESS_TYPES.map((id) => ({ id, label: BUSINESS_TYPE_LABELS[id] })),
    demoCities: ["London", "Manchester", "New York"],
    examples: EXAMPLES,
    latency: config.mockLatency,
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

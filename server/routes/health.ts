import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import { BUSINESS_TYPES, type ExampleInput } from "@shared/types";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getProvider } from "../providers/index.js";

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

export function registerHealth(app: FastifyInstance): void {
  app.get("/api/health", async () => {
    const provider = getProvider();
    return {
      ok: true as const,
      provider: provider.name,
      providerLabel: provider.label,
      demo: provider.name === "mock",
      version: version(),
    };
  });

  app.get("/api/meta", async () => ({
    businessTypes: BUSINESS_TYPES.map((id) => ({ id, label: BUSINESS_TYPE_LABELS[id] })),
    demoCities: ["London", "Manchester", "New York"],
    examples: EXAMPLES,
    latency: config.mockLatency,
  }));
}

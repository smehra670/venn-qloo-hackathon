import { BriefSchema, HeatmapSchema, PartnerSchema, RunResultSchema } from "@shared/schemas";
import type { Brief, BusinessInput, BusinessType, ExampleInput, Heatmap, Partner, ProviderName, RunResult, RunStatus } from "@shared/types";
import { z } from "zod";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit | undefined, parse: (value: unknown) => T): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return parse(null);
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }
  return parse(payload);
}

const HealthSchema = z
  .object({
    ok: z.literal(true),
    provider: z.enum(["mock", "qloo", "snapshot"]),
    providerLabel: z.string(),
    demo: z.boolean(),
    version: z.string(),
  })
  .passthrough();

const MetaSchema = z.object({
  businessTypes: z.array(z.object({ id: z.string(), label: z.string() })),
  demoCities: z.array(z.string()),
  examples: z.array(
    z.object({
      businessType: z.string(),
      city: z.string(),
      anchors: z.array(z.string()),
      businessName: z.string().optional(),
    }),
  ),
});

export interface Health {
  ok: true;
  provider: ProviderName;
  providerLabel: string;
  demo: boolean;
  version: string;
}

export interface Meta {
  businessTypes: { id: BusinessType; label: string }[];
  demoCities: string[];
  examples: ExampleInput[];
}

export function getHealth(): Promise<Health> {
  return request("/api/health", undefined, (value) => HealthSchema.parse(value));
}

export function getMeta(): Promise<Meta> {
  return request("/api/meta", undefined, (value) => {
    const parsed = MetaSchema.parse(value);
    return {
      businessTypes: parsed.businessTypes as Meta["businessTypes"],
      demoCities: parsed.demoCities,
      examples: parsed.examples as ExampleInput[],
    };
  });
}

export function createRun(input: BusinessInput): Promise<{ runId: string }> {
  return request("/api/runs", { method: "POST", body: JSON.stringify(input) }, (value) =>
    z.object({ runId: z.string() }).parse(value),
  );
}

export function getRun(id: string): Promise<{ status: RunStatus; result?: RunResult; error?: string }> {
  return request(`/api/runs/${id}`, undefined, (value) =>
    z
      .object({
        status: z.enum(["running", "done", "error", "cancelled"]),
        result: RunResultSchema.optional(),
        error: z.string().optional(),
      })
      .parse(value),
  );
}

export function cancelRun(id: string): Promise<void> {
  return request(`/api/runs/${id}`, { method: "DELETE" }, () => undefined);
}

export function expandRun(id: string, partnerId: string): Promise<{ added: Partner[]; message?: string }> {
  return request(`/api/runs/${id}/expand`, { method: "POST", body: JSON.stringify({ partnerId }) }, (value) =>
    z.object({ added: z.array(PartnerSchema), message: z.string().optional() }).parse(value),
  );
}

export function getHeatmap(id: string, partnerId: string): Promise<Heatmap | null> {
  return request(`/api/runs/${id}/heatmap?partnerId=${encodeURIComponent(partnerId)}`, undefined, (value) => {
    if (value === null) return null;
    return HeatmapSchema.parse(value);
  });
}

export function createBrief(id: string, partnerId: string, variant: number): Promise<Brief> {
  return request(
    `/api/runs/${id}/brief`,
    { method: "POST", body: JSON.stringify({ partnerId, variant }) },
    (value) => BriefSchema.parse(value),
  );
}

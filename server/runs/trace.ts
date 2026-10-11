import { config } from "../config.js";
import { sleep } from "../utils/sleep.js";

export function latencyMs(mode: typeof config.mockLatency = config.mockLatency): number {
  if (mode === "off") return 0;
  if (mode === "fast") return 60 + Math.random() * 90;
  return 250 + Math.random() * 450;
}

export async function waitForLatency(signal?: AbortSignal): Promise<void> {
  await sleep(latencyMs(), signal);
}

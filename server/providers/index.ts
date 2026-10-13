import type { TasteProvider } from "./types.js";
import { config } from "../config.js";
import { MockTasteProvider } from "./mock/index.js";
import { QlooTasteProvider } from "./qloo/index.js";
import { SnapshotTasteProvider } from "./snapshot/index.js";

let defaultProvider: TasteProvider | null = null;
let liveProvider: TasteProvider | null = null;

function buildDefaultProvider(): TasteProvider {
  if (config.tasteProvider === "qloo") return new QlooTasteProvider();
  if (config.tasteProvider === "snapshot") return new SnapshotTasteProvider();
  return new MockTasteProvider();
}

export function getProvider(opts?: { live?: boolean }): TasteProvider {
  if (opts?.live && config.tasteProvider === "snapshot") {
    if (!liveProvider) liveProvider = new QlooTasteProvider();
    return liveProvider;
  }
  if (!defaultProvider) defaultProvider = buildDefaultProvider();
  return defaultProvider;
}

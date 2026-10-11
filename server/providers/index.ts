import type { TasteProvider } from "./types.js";
import { config } from "../config.js";
import { MockTasteProvider } from "./mock/index.js";
import { QlooTasteProvider } from "./qloo/index.js";

let provider: TasteProvider | null = null;

export function getProvider(): TasteProvider {
  if (!provider) {
    provider = config.tasteProvider === "qloo" ? new QlooTasteProvider() : new MockTasteProvider();
  }
  return provider;
}

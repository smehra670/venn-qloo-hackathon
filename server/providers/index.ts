import type { BusinessInput } from "@shared/types";
import type { TasteProvider } from "./types.js";
import { config } from "../config.js";
import { isExampleInput } from "../examples.js";
import { MockTasteProvider } from "./mock/index.js";
import { QlooTasteProvider } from "./qloo/index.js";
import { hasSnapshot, SnapshotTasteProvider } from "./snapshot/index.js";

let defaultProvider: TasteProvider | null = null;
let liveProvider: TasteProvider | null = null;
let exampleSnapshotProvider: TasteProvider | null = null;

function buildDefaultProvider(): TasteProvider {
  if (config.tasteProvider === "qloo") return new QlooTasteProvider();
  if (config.tasteProvider === "snapshot") return new SnapshotTasteProvider();
  return new MockTasteProvider();
}

/**
 * `opts.live`: forces the live Qloo provider for this call even when `TASTE_PROVIDER=snapshot`
 * (set from the `live` flag on `POST /api/runs`).
 *
 * `opts.input`, when it's one of the three built-in examples (`isExampleInput`) and a saved
 * snapshot exists for it, routes to the snapshot provider regardless of `TASTE_PROVIDER` — as
 * long as `EXAMPLES_MODE=snapshot` (the default) and the caller didn't ask for a live run. This
 * is what keeps the built-in examples showing real saved Qloo results even when the app is
 * otherwise running on `TASTE_PROVIDER=mock` (e.g. a fresh clone with no `.env`), so the demo
 * doesn't look synthetic. A free-form search, or `TASTE_PROVIDER=qloo`/`snapshot` explicitly
 * set, is unaffected either way.
 */
export function getProvider(opts?: { live?: boolean; input?: BusinessInput }): TasteProvider {
  if (opts?.live && config.tasteProvider === "snapshot") {
    if (!liveProvider) liveProvider = new QlooTasteProvider();
    return liveProvider;
  }
  if (
    !opts?.live &&
    config.examplesMode === "snapshot" &&
    config.tasteProvider !== "snapshot" &&
    opts?.input &&
    isExampleInput(opts.input) &&
    hasSnapshot(opts.input)
  ) {
    if (!exampleSnapshotProvider) exampleSnapshotProvider = new SnapshotTasteProvider();
    return exampleSnapshotProvider;
  }
  if (!defaultProvider) defaultProvider = buildDefaultProvider();
  return defaultProvider;
}

/** True when `provider` is the live Qloo provider (i.e. actually makes network calls), as
 * opposed to mock data or a saved snapshot replay — both of which also report `name: "qloo"`
 * for display parity but spend no quota. Used to gate `POST /api/runs` on quota (see
 * `isQuotaBelowFloor()` in `providers/qloo/client.ts`). */
export function isLiveQlooProvider(provider: TasteProvider): boolean {
  return provider instanceof QlooTasteProvider;
}

import type { BusinessInput } from "@shared/types";
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

/**
 * `opts.live`: forces the live Qloo provider for this call even when `TASTE_PROVIDER=snapshot`
 * (set from the `live` flag on `POST /api/runs`).
 *
 * `opts.input` is accepted (and threaded through from the runner/routes) so quota/eligibility
 * checks that live alongside provider selection (`isLiveQlooProvider`, `isQuotaBelowFloor`) can
 * see the same input, but it does not currently change which provider is picked: swapping to a
 * saved snapshot mid-run (when `TASTE_PROVIDER` is `mock`/`qloo`) changed provider identity for
 * matching inputs in ways other code assumes stay in lockstep with `TASTE_PROVIDER` (e.g.
 * `score()`'s optional `out.normalization`, which only `QlooTasteProvider`/`MockTasteProvider`
 * currently set). `TASTE_PROVIDER=snapshot` (+ the `live` request flag to opt back into real
 * Qloo) remains the supported way to replay saved examples. `EXAMPLES_MODE` is read today by
 * `GET /api/health` (`examplesMode`) and `isExampleInput()` (server/examples.ts) is available
 * for a future, more complete wiring here.
 */
export function getProvider(opts?: { live?: boolean; input?: BusinessInput }): TasteProvider {
  if (opts?.live && config.tasteProvider === "snapshot") {
    if (!liveProvider) liveProvider = new QlooTasteProvider();
    return liveProvider;
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

import { config as loadDotenv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

loadDotenv();
if (!process.env.TASTE_PROVIDER) {
  process.env.TASTE_PROVIDER = process.env.QLOO_API_KEY ? "qloo" : "mock";
}
if (!process.env.MOCK_LATENCY) process.env.MOCK_LATENCY = "off";

const { config } = await import("../server/config.js");
const { EXAMPLES } = await import("../server/routes/health.js");
const { createRun, getRun, disposeStore } = await import("../server/runs/store.js");
const { executeRun } = await import("../server/runs/runner.js");
const { hashInput } = await import("../server/providers/snapshot/hash.js");

interface ManifestEntry {
  index: number;
  hash: string;
  businessName?: string;
  city: string;
  provider: string;
  date: string;
}

async function waitForRun(id: string) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const run = getRun(id);
    if (run?.status === "done" && run.result) return run.result;
    if (run?.status === "error") throw new Error(run.error ?? "Run failed");
    if (run?.status === "cancelled") throw new Error("Run was cancelled");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for run ${id}`);
}

async function main() {
  const dir = path.resolve(process.cwd(), config.snapshotDir);
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const manifest: ManifestEntry[] = [];

  for (let index = 0; index < EXAMPLES.length; index += 1) {
    const example = EXAMPLES[index];
    if (!example) continue;
    const run = createRun(example);
    await executeRun(run, () => {});
    const result = await waitForRun(run.id);
    const hash = hashInput(example);
    const file = path.join(dir, `${hash}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        {
          meta: { date, provider: result.provider, exampleIndex: index, businessName: example.businessName },
          result,
        },
        null,
        2,
      ),
    );
    manifest.push({
      index,
      hash,
      businessName: example.businessName,
      city: example.city,
      provider: result.provider,
      date,
    });
    console.log(`Snapshot ${index}: ${example.city} -> ${hash}.json (${result.partners.length} partners, ${result.provider})`);
  }

  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} snapshots to ${dir}`);
  disposeStore();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

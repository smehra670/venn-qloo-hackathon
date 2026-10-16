/**
 * Anchor-focused Qloo probe (≤30 calls). Updates docs/QLOO_CONTRACT_V2.md anchor section.
 * Never prints the API key.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

loadEnv();

const base = (process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com").replace(/\/$/, "");
const key = process.env.QLOO_API_KEY;
if (!key) {
  console.error("QLOO_API_KEY missing");
  process.exit(1);
}

const MAX_CALLS = 30;
const MIN_GAP_MS = 300;
let callCount = 0;
let lastCallAt = 0;
const findings = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pace() {
  const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
}

async function get(pathname, params = {}) {
  if (callCount >= MAX_CALLS) return { status: 0, body: { skipped: true }, ms: 0 };
  await pace();
  callCount += 1;
  lastCallAt = Date.now();
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const url = `${base}${pathname}${search.toString() ? `?${search}` : ""}`;
  const started = Date.now();
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Api-Key": key } });
  const ms = Date.now() - started;
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, ms, url: pathname };
}

function entityIds(body) {
  const list = body?.results ?? body?.results?.entities ?? [];
  const arr = Array.isArray(list) ? list : [];
  return arr.map((e) => e.entity_id ?? e.id).filter(Boolean);
}

function tagList(body) {
  const tags = body?.results?.tags ?? body?.results ?? [];
  const arr = Array.isArray(tags) ? tags : [];
  return arr
    .map((t) => ({ id: t.tag_id ?? t.id ?? "", name: t.name ?? "" }))
    .filter((t) => t.id);
}

function overlap(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hit = a.filter((id) => setB.has(id)).length;
  return hit / Math.max(a.length, b.length);
}

const WORDS = ["jazz", "jazz music", "food", "natural wine", "yoga", "vinyl records", "specialty coffee", "bookshop"];

console.log("=== /search vs /v2/tags ===");
const tagIdsByWord = {};
for (const word of WORDS) {
  const search = await get("/search", { query: word, take: 5 });
  const tags = await get("/v2/tags", {
    "filter.query": word,
    "feature.semantic_search": "true",
    take: 8,
  });
  const entities = entityIds(search.body);
  const tagsFound = tagList(tags.body);
  tagIdsByWord[word] = tagsFound;
  const line = `${word}: search=${search.status} ents=${entities.length}; tags=${tags.status} n=${tagsFound.length} names=${tagsFound
    .slice(0, 3)
    .map((t) => t.name)
    .join(" | ")}`;
  console.log(line);
  findings.push(line);
}

console.log("\n=== tag signal effect (London places) ===");
const signalWords = ["jazz", "natural wine", "yoga"];
const london = "POINT(-0.1276 51.5072)";
for (const word of signalWords) {
  const tags = tagIdsByWord[word] ?? [];
  const tagId = tags[0]?.id;
  if (!tagId) {
    findings.push(`${word}: no tag id — skip signal test`);
    continue;
  }
  const baseline = await get("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location": london,
    "filter.location.radius": 15000,
    take: 20,
  });
  const withSignal = await get("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location": london,
    "filter.location.radius": 15000,
    "signal.interests.tags": tagId,
    take: 20,
  });
  const baseIds = entityIds(baseline.body);
  const sigIds = entityIds(withSignal.body);
  const ov = overlap(baseIds.slice(0, 20), sigIds.slice(0, 20));
  const line = `${word} tag=${tags[0].name}: baseline=${baseIds.length} signal=${sigIds.length} overlap=${ov.toFixed(2)} changes=${ov < 0.8}`;
  console.log(line);
  findings.push(line);
}

console.log("\n=== operator union vs intersection ===");
const jazzTags = (tagIdsByWord.jazz ?? []).slice(0, 2).map((t) => t.id);
const wineTags = (tagIdsByWord["natural wine"] ?? []).slice(0, 1).map((t) => t.id);
const multi = [...jazzTags, ...wineTags].slice(0, 3);
if (multi.length >= 2) {
  const union = await get("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location": london,
    "filter.location.radius": 15000,
    "signal.interests.tags": multi.join(","),
    "operator.signal.interests.tags": "union",
    take: 15,
  });
  const inter = await get("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location": london,
    "filter.location.radius": 15000,
    "signal.interests.tags": multi.join(","),
    "operator.signal.interests.tags": "intersection",
    take: 15,
  });
  const u = entityIds(union.body).length;
  const i = entityIds(inter.body).length;
  const line = `operator tags=${multi.length}: union=${union.status}/${u} intersection=${inter.status}/${i}`;
  console.log(line);
  findings.push(line);
} else {
  findings.push("operator: skipped (need ≥2 tag ids)");
}

console.log("\n=== compare + explainability with tags ===");
const aTag = (tagIdsByWord.jazz ?? [])[0]?.id;
const bTag = (tagIdsByWord.yoga ?? [])[0]?.id;
if (aTag && bTag) {
  const compare = await get("/v2/analysis/compare", {
    "a.signal.interests.tags": aTag,
    "b.signal.interests.tags": bTag,
    "filter.type": "urn:tag",
  });
  const keys =
    compare.body?.results && typeof compare.body.results === "object" && !Array.isArray(compare.body.results)
      ? Object.keys(compare.body.results)
      : [];
  const line = `compare tags: status=${compare.status} keys=${keys.join(",") || "none"}`;
  console.log(line);
  findings.push(line);
} else {
  findings.push("compare tags: skipped");
}

if (aTag) {
  const explain = await get("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location": london,
    "filter.location.radius": 15000,
    "signal.interests.tags": aTag,
    "feature.explainability": "true",
    take: 5,
  });
  const raw = JSON.stringify(explain.body ?? {});
  const hasExplain = /explainability/i.test(raw);
  const line = `explainability+tags: status=${explain.status} hasExplain=${hasExplain}`;
  console.log(line);
  findings.push(line);
}

const reportPath = path.resolve("server/providers/qloo/fixtures/v2/anchors-probe-report.json");
writeFileSync(reportPath, JSON.stringify({ callCount, findings, at: new Date().toISOString() }, null, 2));
console.log(`\nDone: ${callCount} calls. Report → ${reportPath}`);

const contractPath = path.resolve("docs/QLOO_CONTRACT_V2.md");
let contract = readFileSync(contractPath, "utf8");
const section = `

## Anchor / tag probe (${new Date().toISOString().slice(0, 10)}, ${callCount} calls)

Probe script: \`scripts/qloo-probe-anchors.mjs\`. Fixture: \`server/providers/qloo/fixtures/v2/anchors-probe-report.json\`.

${findings.map((f) => `- ${f}`).join("\n")}

**Build defaults from this probe:**
- Resolve topics via \`GET /v2/tags\` with \`filter.query\` + \`feature.semantic_search=true&take=8\` when the probe returned tags.
- Discover may send \`signal.interests.tags\` when overlap with the no-signal baseline is **under 0.8**.
- Prefer \`operator.signal.interests.tags=union\` unless intersection clearly returns fewer/more useful results.
- Omit tag signals from \`/v2/analysis/compare\` and explainability UI if those probes did not return usable fields.
`;

if (contract.includes("## Anchor / tag probe")) {
  contract = contract.replace(/## Anchor \/ tag probe[\s\S]*?(?=\n## |\nAuth:|$)/, section.trim() + "\n\n");
} else {
  contract = contract.trimEnd() + "\n" + section;
}
writeFileSync(contractPath, contract);
console.log("Updated docs/QLOO_CONTRACT_V2.md");

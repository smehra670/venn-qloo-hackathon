/**
 * Step 0 swipe-cards probe (`npm run qloo:probe -- cards`). Hard cap 40 calls.
 * Tests three deck strategies — L (local popularity), S (seeded, verified), R (refill) —
 * and writes a names/ids-only summary to server/providers/qloo/fixtures/cards/_report.json.
 * Never prints the API key. docs/CARDS_PROBE.md is written by hand from that report.
 */
import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

loadEnv();

const base = (process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com").replace(/\/$/, "");
const key = process.env.QLOO_API_KEY;
if (!key) {
  console.error("QLOO_API_KEY missing — add it to .env (do not paste the value in chat).");
  process.exit(1);
}

const MAX_CALLS = 40;
const MIN_GAP_MS = 300;
let callCount = 0;
let lastCallAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(pathname, params = {}) {
  if (callCount >= MAX_CALLS) return { status: 0, ms: 0, body: null, skipped: true };
  const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  callCount += 1;
  lastCallAt = Date.now();
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const started = Date.now();
  let status = 0;
  let body = null;
  try {
    const response = await fetch(`${base}${pathname}?${search}`, {
      headers: { Accept: "application/json", "X-Api-Key": key },
    });
    status = response.status;
    const text = await response.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 300) };
    }
  } catch (err) {
    body = { error: String(err?.message ?? err).slice(0, 200) };
  }
  return { status, ms: Date.now() - started, body };
}

const entitiesOf = (body) => {
  const r = body?.results;
  if (Array.isArray(r?.entities)) return r.entities;
  if (Array.isArray(r)) return r;
  return [];
};
const tagsOf = (body) => {
  const r = body?.results;
  const list = Array.isArray(r?.tags) ? r.tags : Array.isArray(r) ? r : [];
  return list.map((t) => ({ id: t.tag_id ?? t.id ?? "", name: t.name ?? "", type: t.subtype ?? t.type ?? "" }));
};
const slim = (e) => ({
  id: e.entity_id ?? e.id,
  name: e.name,
  types: e.types ?? (e.subtype ? [e.subtype] : undefined),
  popularity: typeof e.popularity === "number" ? Number(e.popularity.toFixed(3)) : undefined,
});
const errorText = (res) =>
  res.status === 200 ? undefined : JSON.stringify(res.body?.errors ?? res.body?.error ?? res.body ?? null).slice(0, 240);

const report = { probedAt: new Date().toISOString(), base, L: {}, tags: {}, S: {}, R: {}, calls: 0 };

// ---------- Strategy L: local popularity ----------
console.log("=== Strategy L ===");
const TYPES = ["urn:entity:brand", "urn:entity:artist", "urn:entity:place"];
const CITIES = ["Manchester", "London"];
for (const type of TYPES) {
  const byCity = {};
  for (const city of CITIES) {
    const res = await get("/v2/insights", { "filter.type": type, "signal.location.query": city, take: 12 });
    const list = entitiesOf(res.body).map(slim);
    byCity[city] = { status: res.status, ms: res.ms, count: list.length, error: errorText(res), results: list };
    console.log(`L ${type} ${city}: ${res.status} ${res.ms}ms n=${list.length}`);
  }
  const a = byCity.Manchester.results.slice(0, 10).map((e) => e.id);
  const b = byCity.London.results.slice(0, 10).map((e) => e.id);
  const shared = a.filter((id) => b.includes(id)).length;
  report.L[type] = {
    byCity,
    top10Shared: shared,
    identical: a.length > 0 && a.length === b.length && a.every((id, i) => id === b[i]),
  };
}
// Comparison: places with a hard location filter instead of a signal.
for (const city of CITIES) {
  const res = await get("/v2/insights", { "filter.type": "urn:entity:place", "filter.location.query": city, take: 12 });
  const list = entitiesOf(res.body).map(slim);
  report.L[`place_filter_${city}`] = { status: res.status, ms: res.ms, count: list.length, error: errorText(res), results: list };
  console.log(`L place filter.location.query ${city}: ${res.status} ${res.ms}ms n=${list.length}`);
}

// ---------- Topics via /v2/tags ----------
console.log("=== Tags ===");
const TAG_SEEDS = { cafe: "specialty coffee", gym_studio: "bouldering", bookshop: "independent bookstores", bar: "craft beer" };
let firstTagId = null;
for (const [biz, phrase] of Object.entries(TAG_SEEDS)) {
  const res = await get("/v2/tags", { "filter.query": phrase, "feature.semantic_search": true, take: 8 });
  const list = tagsOf(res.body);
  if (!firstTagId && list[0]?.id) firstTagId = list[0].id;
  report.tags[biz] = { phrase, status: res.status, ms: res.ms, count: list.length, error: errorText(res), results: list };
  console.log(`tags ${biz} "${phrase}": ${res.status} ${res.ms}ms n=${list.length}`);
}
if (firstTagId) {
  const res = await get("/v2/insights", { "filter.type": "urn:entity:brand", "signal.interests.tags": firstTagId, take: 8 });
  const list = entitiesOf(res.body).map(slim);
  report.tags.asSignal = { tagId: firstTagId, status: res.status, ms: res.ms, count: list.length, error: errorText(res), results: list };
  console.log(`tag as signal.interests.tags: ${res.status} ${res.ms}ms n=${list.length}`);
}

// ---------- Strategy S: seeded, verified ----------
console.log("=== Strategy S ===");
const SEEDS = [
  { biz: "cafe", name: "Aesop", type: "urn:entity:brand" },
  { biz: "cafe", name: "Muji", type: "urn:entity:brand" },
  { biz: "cafe", name: "Patagonia", type: "urn:entity:brand" },
  { biz: "cafe", name: "Oatly", type: "urn:entity:brand" },
  { biz: "cafe", name: "Radiohead", type: "urn:entity:artist" },
  { biz: "cafe", name: "Bon Iver", type: "urn:entity:artist" },
  { biz: "gym_studio", name: "Lululemon", type: "urn:entity:brand" },
  { biz: "gym_studio", name: "Gymshark", type: "urn:entity:brand" },
  { biz: "gym_studio", name: "Nike", type: "urn:entity:brand" },
  { biz: "gym_studio", name: "Peloton", type: "urn:entity:brand" },
  { biz: "gym_studio", name: "Dua Lipa", type: "urn:entity:artist" },
  { biz: "gym_studio", name: "Calvin Harris", type: "urn:entity:artist" },
];
const norm = (s) => String(s ?? "").trim().toLowerCase();
const resolved = [];
const seedRows = [];
for (const seed of SEEDS) {
  const res = await get("/search", { query: seed.name, types: seed.type, take: 5 });
  const list = entitiesOf(res.body).map(slim);
  const exact = list.filter((e) => norm(e.name) === norm(seed.name));
  const verdict = exact.length === 1 ? "clean" : exact.length > 1 ? "ambiguous" : "unresolved";
  if (verdict === "clean") resolved.push({ ...seed, id: exact[0].id });
  seedRows.push({ ...seed, status: res.status, ms: res.ms, verdict, top: list.slice(0, 3) });
  console.log(`S ${seed.name}: ${res.status} ${res.ms}ms ${verdict}`);
}
report.S = {
  rows: seedRows,
  clean: seedRows.filter((r) => r.verdict === "clean").length,
  ambiguous: seedRows.filter((r) => r.verdict === "ambiguous").length,
  unresolved: seedRows.filter((r) => r.verdict === "unresolved").length,
  total: seedRows.length,
};

// ---------- Strategy R: refill from Yeses ----------
console.log("=== Strategy R ===");
const liked = resolved.filter((r) => r.biz === "cafe").slice(0, 3);
const likedIds = liked.map((r) => r.id);
const seedIdSet = new Set(resolved.map((r) => r.id));
for (const type of TYPES) {
  if (!likedIds.length) break;
  const params = { "filter.type": type, "signal.interests.entities": likedIds.join(","), take: 8 };
  if (type === "urn:entity:place") params["filter.location.query"] = "Manchester";
  const res = await get("/v2/insights", params);
  const list = entitiesOf(res.body).map(slim);
  report.R[type] = {
    liked: liked.map((r) => r.name),
    status: res.status,
    ms: res.ms,
    count: list.length,
    seedEchoes: list.filter((e) => seedIdSet.has(e.id)).map((e) => e.name),
    error: errorText(res),
    results: list,
  };
  console.log(`R ${type}: ${res.status} ${res.ms}ms n=${list.length}`);
}

report.calls = callCount;
const outDir = path.resolve("server/providers/qloo/fixtures/cards");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "_report.json"), JSON.stringify(report, null, 2));
console.log(`\ncalls=${callCount} — wrote server/providers/qloo/fixtures/cards/_report.json`);

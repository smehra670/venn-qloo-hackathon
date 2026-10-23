/**
 * Phase 0 Qloo probe v2 — redacted fixtures under server/providers/qloo/fixtures/v2/
 * Paces ~4 rps, caps at 80 calls. Never prints the API key.
 * Requires QLOO_API_KEY in env or .env.
 */
import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

loadEnv();

// `npm run qloo:probe -- cards` runs the swipe-cards probe instead (Step 0, ≤40 calls).
if (process.argv[2] === "cards") {
  await import("./qloo-probe-cards.mjs");
  process.exit(0);
}

const base = (process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com").replace(/\/$/, "");
const key = process.env.QLOO_API_KEY;
if (!key) {
  console.error("QLOO_API_KEY missing — add it to .env (do not paste the value in chat).");
  process.exit(1);
}

const outDir = path.resolve("server/providers/qloo/fixtures/v2");
mkdirSync(outDir, { recursive: true });

const KEY_PREFIXES = [/hack_[a-f0-9]+/gi, /sk-[a-zA-Z0-9_-]+/g, /Bearer\s+\S+/gi];
const MAX_CALLS = 80;
const MIN_GAP_MS = 280;
let callCount = 0;
let lastCallAt = 0;

function redact(value) {
  const json = JSON.stringify(value, null, 2);
  let cleaned = json;
  for (const re of KEY_PREFIXES) cleaned = cleaned.replace(re, "[REDACTED]");
  return JSON.parse(cleaned);
}

function stripHeavy(entity) {
  if (!entity || typeof entity !== "object") return entity;
  const copy = { ...entity };
  delete copy.akas;
  if (Array.isArray(copy.tags) && copy.tags.length > 8) copy.tags = copy.tags.slice(0, 8);
  if (copy.properties && typeof copy.properties === "object") {
    const p = copy.properties;
    copy.properties = {
      address: p.address ?? p.formatted_address ?? undefined,
      website: p.website ?? p.url ?? undefined,
      is_closed: p.is_closed ?? undefined,
      neighborhood: p.neighborhood ?? p.neighbourhood ?? undefined,
      price_level: p.price_level ?? undefined,
    };
  }
  if (copy.images) {
    const hosts = [];
    const walk = (v) => {
      if (typeof v === "string" && v.startsWith("http")) {
        try {
          hosts.push(new URL(v).host);
        } catch {
          /* ignore */
        }
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(copy.images);
    copy.imageHosts = [...new Set(hosts)].slice(0, 5);
    delete copy.images;
  }
  return copy;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pace() {
  const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
}

async function get(pathname, params = {}, host = base) {
  if (callCount >= MAX_CALLS) {
    return { status: 0, ms: 0, rateHeaders: {}, body: { error: "call cap" }, url: pathname, skipped: true };
  }
  await pace();
  callCount += 1;
  lastCallAt = Date.now();
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const url = `${host}${pathname}${search.toString() ? `?${search}` : ""}`;
  const started = Date.now();
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Api-Key": key },
  });
  const ms = Date.now() - started;
  const rateHeaders = {};
  for (const h of [
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "x-month-ratelimit-remaining",
    "x-second-ratelimit-reset",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
  ]) {
    const val = response.headers.get(h);
    if (val) rateHeaders[h] = val;
  }
  let body = null;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: response.status, ms, rateHeaders, body, url: pathname };
}

function save(name, payload) {
  const file = path.join(outDir, `${name}.json`);
  writeFileSync(file, JSON.stringify(redact(payload), null, 2));
  console.log(`wrote ${name}.json`);
}

const report = {
  probedAt: new Date().toISOString(),
  base,
  callCount: 0,
  gates: {},
  probes: [],
  coverage: [],
};

function entityList(sample) {
  if (!sample) return [];
  if (Array.isArray(sample.results?.entities)) return sample.results.entities;
  if (Array.isArray(sample.results)) return sample.results;
  if (Array.isArray(sample.entities)) return sample.entities;
  return [];
}

async function probe(name, pathname, params, shapeHint, host = base) {
  const result = await get(pathname, params, host);
  if (result.skipped) {
    console.log(`${name}: SKIPPED (call cap)`);
    return result;
  }
  const sample = result.body;
  let entities = entityList(sample);
  const entityCount = Array.isArray(entities) ? entities.length : 0;
  if (Array.isArray(entities)) entities = entities.slice(0, 3).map(stripHeavy);

  const slim = {
    status: result.status,
    ms: result.ms,
    rateHeaders: result.rateHeaders,
    success: sample?.success,
    keys: sample && typeof sample === "object" ? Object.keys(sample) : [],
    resultsKeys:
      sample?.results && typeof sample.results === "object" && !Array.isArray(sample.results)
        ? Object.keys(sample.results)
        : Array.isArray(sample?.results)
          ? ["(array)"]
          : [],
    entityCount,
    entitySample: entities,
    shapeHint,
    emptyOn200: result.status === 200 && entityCount === 0 && !sample?.results?.heatmap && !sample?.results?.tags,
  };
  save(name, slim);
  report.probes.push({
    name,
    pathname,
    status: result.status,
    ms: result.ms,
    entityCount,
    emptyOn200: slim.emptyOn200,
    rateHeaders: result.rateHeaders,
  });
  console.log(`${name}: ${result.status} (${result.ms}ms) entities=${entityCount}${slim.emptyOn200 ? " EMPTY" : ""}`);
  return { ...result, entityCount, emptyOn200: slim.emptyOn200 };
}

// --- Host check ---
const prodHost = "https://api.qloo.com";
const hostCheck = await get("/search", { query: "Aesop", types: "urn:entity:brand", take: 1 }, prodHost);
report.gates.prodHostStatus = hostCheck.status;
console.log(`prod host /search: ${hostCheck.status}`);

// --- Core resolve ---
const searchBrand = await probe("search_brand", "/search", { query: "Aesop", types: "urn:entity:brand", take: 5 }, "search");
const brandId = searchBrand.body?.results?.[0]?.entity_id ?? searchBrand.body?.results?.[0]?.id ?? null;

const searchBrandUntyped = await probe("search_aesop_untyped", "/search", { query: "Aesop", take: 8 }, "search_ambiguous");
const aesopTypes = entityList(searchBrandUntyped.body).map((e) => ({
  name: e.name,
  id: e.entity_id ?? e.id,
  types: e.types ?? e.type ?? e.subtype,
}));
report.gates.aesopAmbiguity = aesopTypes;

const searchArtist = await probe("search_artist", "/search", { query: "Radiohead", types: "urn:entity:artist", take: 3 }, "search");
const artistId = searchArtist.body?.results?.[0]?.entity_id ?? searchArtist.body?.results?.[0]?.id ?? null;

await probe("search_location", "/search", { query: "London", types: "urn:entity:locality,urn:entity:place,urn:entity:destination", take: 5 }, "search_location");
await probe("tags_search", "/v2/tags", { "filter.query": "pilates", take: 5 }, "tags");
await probe("tags_place_parents", "/v2/tags", { "filter.query": "cafe", "filter.parents.types": "urn:entity:place", take: 8 }, "tags_place");

const insightsBrand = await probe(
  "insights_brand",
  "/v2/insights",
  { "filter.type": "urn:entity:brand", "signal.interests.entities": brandId ?? undefined, take: 15 },
  "insights_entities",
);
const poolBrandIds = entityList(insightsBrand.body)
  .map((e) => e.entity_id ?? e.id)
  .filter(Boolean)
  .slice(0, 14);

// --- GATE: filter.results.entities ---
const rankIds = [...new Set([...(brandId ? [brandId] : []), ...poolBrandIds])].slice(0, 12);
const rankProbe = await probe(
  "insights_rank_results_entities",
  "/v2/insights",
  {
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": brandId ?? undefined,
    "filter.results.entities": rankIds.join(","),
    take: 20,
  },
  "rank_together",
);
const ranked = entityList(rankProbe.body);
const rankedIds = new Set(ranked.map((e) => e.entity_id ?? e.id).filter(Boolean));
const askedSet = new Set(rankIds);
const intersection = [...askedSet].filter((id) => rankedIds.has(id));
const affinities = ranked.map((e) => e.query?.affinity ?? e.affinity).filter((n) => typeof n === "number");
report.gates.rankTogether = {
  status: rankProbe.status,
  asked: rankIds.length,
  returned: ranked.length,
  intersection: intersection.length,
  hasAffinity: affinities.length > 0,
  emptyOn200: rankProbe.emptyOn200,
  supported:
    rankProbe.status === 200 &&
    !rankProbe.emptyOn200 &&
    intersection.length >= Math.min(3, rankIds.length) &&
    affinities.length > 0,
};
console.log(`GATE rankTogether supported=${report.gates.rankTogether.supported} intersection=${intersection.length}/${rankIds.length}`);

// --- Compare endpoints ---
const compareOk = await probe(
  "analysis_compare",
  "/v2/analysis/compare",
  {
    "a.signal.interests.entities": brandId ?? undefined,
    "b.signal.interests.entities": artistId ?? undefined,
    "filter.type": "urn:tag",
  },
  "analysis_compare",
);
await probe(
  "insights_compare_wrong_path",
  "/v2/insights/compare",
  {
    "a.signal.interests.entities": brandId ?? undefined,
    "b.signal.interests.entities": artistId ?? undefined,
    "filter.type": "urn:entity:brand",
  },
  "wrong_compare",
);
const compareTags = compareOk.body?.results?.tags ?? compareOk.body?.results?.entities;
report.gates.analysisCompare = {
  status: compareOk.status,
  resultsKeys:
    compareOk.body?.results && typeof compareOk.body.results === "object" && !Array.isArray(compareOk.body.results)
      ? Object.keys(compareOk.body.results)
      : [],
  tagCount: Array.isArray(compareTags) ? compareTags.length : 0,
  supported: compareOk.status === 200 && Array.isArray(compareTags) && compareTags.length > 0,
};

// keep multi-signal insights as fallback fixture
await probe(
  "insights_compare",
  "/v2/insights",
  {
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": [brandId, artistId].filter(Boolean).join(",") || undefined,
    take: 5,
  },
  "insights_multi_signal",
);

// --- Demographics (urn:demographics — no signal.demographics.* in product) ---
const demo = await probe(
  "insights_demographics",
  "/v2/insights",
  {
    "filter.type": "urn:demographics",
    "signal.interests.entities": brandId ?? undefined,
    take: 5,
  },
  "demographics",
);
report.gates.demographics = {
  status: demo.status,
  resultsKeys:
    demo.body?.results && typeof demo.body.results === "object" && !Array.isArray(demo.body.results)
      ? Object.keys(demo.body.results)
      : [],
  emptyOn200: demo.emptyOn200,
  supported: demo.status === 200 && !demo.emptyOn200,
};

// --- Trending ---
const trending = await probe(
  "trending",
  "/v2/trending",
  {
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": brandId ?? undefined,
  },
  "trending",
);
const trendSeries = trending.body?.results ?? trending.body?.data ?? trending.body;
let flat = null;
if (Array.isArray(trendSeries)) {
  const vals = trendSeries.map((p) => p.value ?? p.score ?? p.y).filter((n) => typeof n === "number");
  if (vals.length >= 2) flat = vals.every((v) => v === vals[0]);
}
report.gates.trending = {
  status: trending.status,
  emptyOn200: trending.emptyOn200,
  flat,
  supported: trending.status === 200 && !trending.emptyOn200 && flat === false,
};

// --- Explainability ---
await probe(
  "insights_trends",
  "/v2/insights",
  {
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": brandId ?? undefined,
    "feature.explainability": true,
    take: 3,
  },
  "explainability",
);

// --- Heatmap ---
await probe(
  "insights_heatmap",
  "/v2/insights",
  {
    "filter.type": "urn:heatmap",
    "signal.interests.entities": brandId ?? undefined,
    "filter.location.query": "London",
    take: 20,
  },
  "insights_heatmap",
);

// --- Local point vs query ---
const londonPoint = "POINT(-0.1276 51.5072)";
await probe(
  "insights_place_point",
  "/v2/insights",
  {
    "filter.type": "urn:entity:place",
    "signal.interests.entities": brandId ?? undefined,
    "filter.location": londonPoint,
    "filter.location.radius": 5000,
    take: 10,
  },
  "place_point_radius",
);
await probe(
  "insights_place_query",
  "/v2/insights",
  {
    "filter.type": "urn:entity:place",
    "signal.interests.entities": brandId ?? undefined,
    "filter.location.query": "London",
    take: 10,
  },
  "place_location_query",
);

// --- Place coverage samples ---
const cities = [
  { name: "London", point: "POINT(-0.1276 51.5072)" },
  { name: "Manchester", point: "POINT(-2.2426 53.4808)" },
  { name: "New York", point: "POINT(-74.006 40.7128)" },
];
for (const city of cities) {
  const r = await probe(
    `coverage_place_${city.name.replace(/\s+/g, "_").toLowerCase()}`,
    "/v2/insights",
    {
      "filter.type": "urn:entity:place",
      "signal.interests.entities": brandId ?? undefined,
      "filter.location": city.point,
      "filter.location.radius": 8000,
      take: 15,
    },
    "coverage",
  );
  const all = entityList(r.body);
  const withLoc = all.filter((e) => e.location?.lat || e.location?.latitude).length;
  const withAddr = all.filter((e) => e.properties?.address || e.properties?.formatted_address).length;
  const withWeb = all.filter((e) => e.properties?.website || e.properties?.url).length;
  const closed = all.filter((e) => e.properties?.is_closed === true).length;
  const withDist = all.filter((e) => typeof e.query?.distance === "number").length;
  report.coverage.push({
    city: city.name,
    status: r.status,
    count: all.length,
    withLoc,
    withAddr,
    withWeb,
    closed,
    withDist,
  });
}

await probe("entities_by_id", "/entities", brandId ? { "filter.entity.id": brandId, take: 1 } : { take: 1 }, "entities");
await probe("v2_entities", "/v2/entities", brandId ? { ids: brandId } : { take: 1 }, "v2_entities");

report.callCount = callCount;
save("_report", report);
save("_gates", report.gates);

console.log("\n=== GATE SUMMARY ===");
console.log(JSON.stringify(report.gates, null, 2));
console.log(`calls=${callCount}`);
console.log("\nProbe complete.");

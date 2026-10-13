/**
 * Phase 0 Qloo probe — writes redacted fixtures under server/providers/qloo/fixtures/v2/
 * and prints a contract summary. Requires QLOO_API_KEY in env or .env.
 */
import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

loadEnv();

const base = (process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com").replace(/\/$/, "");
const key = process.env.QLOO_API_KEY;
if (!key) {
  console.error("QLOO_API_KEY missing");
  process.exit(1);
}

const outDir = path.resolve("server/providers/qloo/fixtures/v2");
mkdirSync(outDir, { recursive: true });

const KEY_PREFIXES = [/hack_[a-f0-9]+/gi, /sk-[a-zA-Z0-9_-]+/g, /Bearer\s+\S+/gi];

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
  delete copy.images;
  delete copy.properties;
  if (Array.isArray(copy.tags) && copy.tags.length > 8) copy.tags = copy.tags.slice(0, 8);
  return copy;
}

async function get(pathname, params = {}) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const url = `${base}${pathname}${search.toString() ? `?${search}` : ""}`;
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
  console.log(`wrote ${file}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const report = { probedAt: new Date().toISOString(), base, probes: [] };

async function probe(name, pathname, params, shapeHint) {
  await sleep(350);
  const result = await get(pathname, params);
  const sample = result.body;
  let entities = sample?.results?.entities ?? sample?.results ?? sample?.entities;
  if (Array.isArray(entities)) {
    entities = entities.slice(0, 3).map(stripHeavy);
  }
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
    entitySample: entities,
    shapeHint,
  };
  save(name, slim);
  report.probes.push({ name, pathname, status: result.status, ms: result.ms, rateHeaders: result.rateHeaders });
  console.log(`${name}: ${result.status} (${result.ms}ms)`);
  return result;
}

// Resolve a known brand for entity-id based probes
const searchBrand = await probe("search_brand", "/search", { query: "Aesop", types: "urn:entity:brand", take: 3 }, "search");
const brandId =
  searchBrand.body?.results?.[0]?.entity_id ??
  searchBrand.body?.results?.[0]?.id ??
  null;

const searchArtist = await probe("search_artist", "/search", { query: "Radiohead", types: "urn:entity:artist", take: 3 }, "search");
const artistId =
  searchArtist.body?.results?.[0]?.entity_id ??
  searchArtist.body?.results?.[0]?.id ??
  null;

const searchCity = await probe(
  "search_location",
  "/search",
  { query: "London", types: "urn:entity:locality,urn:entity:place,urn:entity:destination", take: 5 },
  "search_location",
);

await probe("tags_search", "/v2/tags", { "filter.query": "pilates", take: 5 }, "tags");

await probe(
  "insights_brand",
  "/v2/insights",
  {
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": brandId ?? undefined,
    take: 5,
  },
  "insights_entities",
);

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

// Compare / dual-signal style (probe wins — may 400/empty)
await probe(
  "insights_compare",
  "/v2/insights",
  {
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": [brandId, artistId].filter(Boolean).join(",") || undefined,
    take: 5,
  },
  "insights_compare",
);

// Demographics audiences — may fail if audience URNs invalid
await probe(
  "insights_demographics",
  "/v2/insights",
  {
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": brandId ?? undefined,
    "signal.demographics.audiences": "urn:audience:communities:millennials",
    take: 3,
  },
  "insights_demographics",
);

// Trends / explain-ish parameters (probe wins)
await probe(
  "insights_trends",
  "/v2/insights",
  {
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": brandId ?? undefined,
    "feature.explainability": true,
    take: 3,
  },
  "insights_trends_explain",
);

await probe(
  "entities_by_id",
  "/entities",
  brandId ? { "filter.entity.id": brandId, take: 1 } : { take: 1 },
  "entities",
);

// Also try /v2/entities if present
await probe(
  "v2_entities",
  "/v2/entities",
  brandId ? { ids: brandId } : { take: 1 },
  "v2_entities",
);

save("_report", report);
console.log("\nProbe complete. Review fixtures and docs/QLOO_CONTRACT_V2.md.");

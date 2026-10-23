/**
 * `npm run cards:seed`: resolves the swipe-card seeds (server/anchors/seeds.ts) to exact Qloo ids
 * and records the snapshot provider's decks and refills.
 *
 * - Brands and artists: `GET /search` with the type filter. Places: `GET /search` for
 *   urn:entity:place, accepted only when the result's address mentions the city.
 *   Topics: `GET /v2/tags`, preferring the `urn:tag:interests:qloo:*` variant.
 * - A seed is kept only when exactly one result has exactly that name. Anything ambiguous or
 *   unresolved is dropped from the file, never guessed.
 * - Names repeated across business types are resolved once, and entries already in
 *   seed-ids.json are skipped, so re-running costs only what is new.
 *
 * Writes server/anchors/seed-ids.json and server/anchors/cards-snapshot.json (public ids only).
 * Flags: --dry-run (count calls, make none), --max-calls=N (default 260).
 * Uses the server's Qloo client, so the limiter, retries and breaker apply. Never prints the key.
 */
import { config as loadDotenv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

loadDotenv();
if (!process.env.MOCK_LATENCY) process.env.MOCK_LATENCY = "off";

const { BUSINESS_TYPES } = await import("../shared/types.js");
const { EXAMPLES } = await import("../server/examples.js");
const { searchEntities, searchTags, insights, entityIdOf, getQlooQuotaRemaining, isQuotaBelowFloor } = await import(
  "../server/providers/qloo/client.js"
);
const { seedKey, seedNamesFor, cardFromSeed } = await import("../server/anchors/cardData.js");
const { buildDeck, cardIdFor } = await import("../server/anchors/deck.js");
const { PLACES, QLOO_NAMES } = await import("../server/anchors/seeds.js");

/** Tag vocabularies in order of preference for a topic card's anchor. */
const TAG_PRIORITY = ["interests", "lifestyle", "keyword", "genre", "subgenre", "activity_type", "cuisine", "hobbies"];

type SeedIds = import("../server/anchors/cardData.js").SeedIdsFile;
type SeedEntry = import("../server/anchors/cardData.js").SeedEntry;
type SwipeCard = import("../shared/schemas.js").SwipeCard;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const maxCalls = Number([...args].find((a) => a.startsWith("--max-calls="))?.split("=")[1] ?? 260);

const dir = path.resolve("server/anchors");
const seedFile = path.join(dir, "seed-ids.json");
const snapshotFile = path.join(dir, "cards-snapshot.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const existing = readJson<SeedIds>(seedFile, { generatedAt: null, entries: {} });
const entries: Record<string, SeedEntry> = { ...existing.entries };

const simplify = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const singular = (s: string): string => s.replace(/s\b/g, "");

const ENTITY_TYPES = { brand: "urn:entity:brand", artist: "urn:entity:artist", place: "urn:entity:place" } as const;

// Every unique seed across business types (and demo cities for places).
const unique = new Map<string, { name: string; kind: SeedEntry["kind"]; city?: string }>();
for (const type of BUSINESS_TYPES) {
  for (const seed of seedNamesFor(type, "")) unique.set(seedKey(seed.kind, seed.name), seed);
}
for (const [city, names] of Object.entries(PLACES)) {
  for (const name of names) unique.set(seedKey("place", name, city), { name, kind: "place", city });
}
const todo = [...unique.entries()].filter(([key]) => !entries[key]);

const stats = { calls: 0, clean: 0, ambiguous: [] as string[], unresolved: [] as string[], failed: [] as string[] };
console.log(`seeds: ${unique.size} unique, ${unique.size - todo.length} already resolved, ${todo.length} to resolve`);

if (dryRun) {
  console.log(`dry run: would make ${todo.length} resolve calls plus up to 12 snapshot refill calls`);
  process.exit(0);
}

function budgetLeft(): boolean {
  if (stats.calls >= maxCalls) return false;
  if (isQuotaBelowFloor()) {
    console.log("stopping: Qloo monthly quota is below the floor");
    return false;
  }
  return true;
}

for (const [key, seed] of todo) {
  if (!budgetLeft()) break;
  const label = seed.city ? `${seed.name} (${seed.city})` : seed.name;
  try {
    stats.calls += 1;
    if (seed.kind === "topic") {
      // One concept appears under several tag vocabularies with the same name; that is not
      // ambiguity, so pick by vocabulary priority instead of requiring a single match.
      const tags = await searchTags(seed.name, undefined, { take: 10 });
      const exact = tags.filter((t) => singular(simplify(t.name)) === singular(simplify(seed.name)));
      const rank = (id: string) => {
        const i = TAG_PRIORITY.findIndex((vocab) => id.includes(`:${vocab}:`));
        return i === -1 ? TAG_PRIORITY.length : i;
      };
      const pick = [...exact].sort((a, b) => rank(a.id) - rank(b.id))[0];
      if (pick) {
        entries[key] = { name: seed.name, kind: "topic", id: pick.id, type: "tag" };
        stats.clean += 1;
      } else stats.unresolved.push(label);
      continue;
    }
    const type = ENTITY_TYPES[seed.kind];
    const qlooName = QLOO_NAMES[seed.name] ?? seed.name;
    const results = await searchEntities({ query: qlooName, types: type, take: 10 });
    let exact = results.filter((e) => simplify(e.name ?? "") === simplify(qlooName));
    if (seed.kind === "place" && seed.city) {
      const city = seed.city.toLowerCase();
      exact = exact.filter((e) => JSON.stringify(e.properties ?? {}).toLowerCase().includes(city));
    }
    const id = exact.length === 1 ? entityIdOf(exact[0]!) : undefined;
    if (id) {
      entries[key] = { name: seed.name, kind: seed.kind, id, type };
      stats.clean += 1;
    } else (exact.length > 1 ? stats.ambiguous : stats.unresolved).push(label);
  } catch (error) {
    stats.failed.push(`${label}: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
  }
}

writeFileSync(seedFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), entries: sortKeys(entries) }, null, 2)}\n`);
console.log(`\nresolved ${stats.clean} of ${todo.length} (${stats.calls} calls)`);
if (stats.ambiguous.length) console.log(`ambiguous (dropped): ${stats.ambiguous.join(", ")}`);
if (stats.unresolved.length) console.log(`unresolved (dropped): ${stats.unresolved.join(", ")}`);
if (stats.failed.length) console.log(`failed (retry later): ${stats.failed.join("; ")}`);

// ---------- snapshot provider: recorded decks and refills for the example pairs ----------
const snapshot = readJson<{ recordedAt: string | null; decks: Record<string, SwipeCard[]>; refills: Record<string, SwipeCard[]> }>(
  snapshotFile,
  { recordedAt: null, decks: {}, refills: {} },
);
const blocklist = readFileSync(path.join(dir, "blocklist.txt"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
let refillCalls = 0;
for (const example of EXAMPLES) {
  const cards = seedNamesFor(example.businessType, example.city)
    .map((seed) => entries[seedKey(seed.kind, seed.name, seed.city)])
    .filter((entry): entry is SeedEntry => Boolean(entry))
    .map((entry) => cardFromSeed(entry, "snapshot"));
  const deck = buildDeck({ businessType: example.businessType, primary: cards, blocklist });
  if (!deck) {
    console.log(`snapshot: not enough resolved seeds for ${example.businessType} / ${example.city}`);
    continue;
  }
  snapshot.decks[`${example.businessType}|${example.city.toLowerCase()}`] = deck;
  // Record refills for the first two entity cards of the deck (2 calls each).
  for (const liked of deck.filter((c) => c.anchor.kind === "entity" && c.kind !== "place").slice(0, 2)) {
    if (snapshot.refills[liked.anchor.id]?.length || !budgetLeft()) continue;
    const recorded: SwipeCard[] = [];
    for (const [kind, type] of [["brand", ENTITY_TYPES.brand], ["artist", ENTITY_TYPES.artist]] as const) {
      try {
        stats.calls += 1;
        refillCalls += 1;
        const { entities } = await insights({ "filter.type": type, "signal.interests.entities": liked.anchor.id, take: 8 });
        for (const entity of entities) {
          const id = entityIdOf(entity);
          const name = entity.name?.trim();
          if (id && name && name.length <= 48) {
            recorded.push({ id: cardIdFor(id), name, kind, provenance: "snapshot", anchor: { kind: "entity", id, type: kind } });
          }
        }
      } catch (error) {
        console.log(`snapshot refill failed for ${liked.name}: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
      }
    }
    if (recorded.length) snapshot.refills[liked.anchor.id] = recorded;
  }
}
snapshot.recordedAt = new Date().toISOString();
writeFileSync(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`snapshot: ${Object.keys(snapshot.decks).length} decks, ${Object.keys(snapshot.refills).length} refills (${refillCalls} calls)`);
console.log(`total Qloo calls: ${stats.calls}; monthly quota remaining: ${getQlooQuotaRemaining() ?? "not reported"}`);

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

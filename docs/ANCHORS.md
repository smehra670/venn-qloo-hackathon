# Taste anchors

How Venn turns “things my customers love” into Qloo signals.

## Flow

1. User types a chip (Enter / comma / blur).
2. `POST /api/anchors/resolve` searches **entities** (`GET /search`) then **topics** (`GET /v2/tags` with semantic search) — mock uses the demo catalog + eight tag fixtures.
3. Pure classifier (`server/anchors/status.ts`) sets status: `entity` | `topic` | `ambiguous` | `too_broad` | `unresolved`.
4. For `too_broad` / `unresolved` only, OpenAI (when enabled) suggests phrases; each suggestion is **verified** on Qloo/mock (≥0.85 name similarity) before the UI shows it as **Suggested**.
5. Submit sends typed `anchors` for headlines plus confirmed `tasteAnchors` (`kind: entity|tag`) for ranking. Unmatched chips default to leave out; optional **Keep as a note** (brief only).

There is no full-screen “Check your anchors” step — pick Names / Topics under the chip.

## Statuses

| Status | Meaning |
| --- | --- |
| `entity` | Clear name match (similarity ≥ 0.85) |
| `topic` | Clear tag/topic match |
| `ambiguous` | Several close Names and/or Topics — user picks |
| `too_broad` | Generic word (food, music, …) that will not change ranking |
| `unresolved` | Nothing above the 0.6 similarity floor |

Candidates below **0.6** are never shown. Stand-in taste profiles are not invented.

## Discover signals

Confirmed entities → `signal.interests.entities`. Confirmed tags → `signal.interests.tags` with `operator.signal.interests.tags=union` (probe: 2026-04). Compare / audience chart stays **entity-only** (`a.signal.interests.tags` returned 400 in probe).

## Mock tag fixtures

jazz, natural wine, yoga, vinyl records, specialty coffee, bookshop, ramen, sourdough.

## AI suggestion golden set (FakeLlm)

Contract tests in `server/anchors/suggest.test.ts` + `FakeLlm` defaults:

| Typed | Verdict | Notes |
| --- | --- | --- |
| Food | too_broad | Verified topics e.g. specialty coffee, sourdough, ramen |
| Music | too_broad | jazz, vinyl records |
| Jazz Music / jazzz | rewrite | jazz |
| people aged 25 to 34 | not_a_taste_signal | empty suggestions |
| religious people / phone / john smith | sensitive | empty |
| ignore your rules… | no_close_match | safe topic only |
| yoga / Aesop | (AI skipped) | Clear topic/ambiguous handled by Qloo path only |

Live OpenAI+Qloo golden counts are environment-dependent; run resolve with `skipAi: false` and a key to refresh verified counts for a release note.

## Safety

`QLOO_API_KEY` / `OPENAI_API_KEY` stay server-side. Prompts never log PII. UI labels AI picks as **Suggested** after Qloo verification.

## Swipe cards

Setup's "Swipe your crowd" is a second way to add anchors: a deck of taste cards the person swipes Yes or Not really on. Typing and the resolver above are unchanged; typed and swiped chips share one list and one cap of six.

**What a card is.** A brand, artist, place or topic with an exact Qloo id (`SwipeCard` in `shared/schemas.ts`). Cards are typographic: no images. Each card carries `anchor: { kind, id, type }`, which is exactly what becomes a chip on Yes: `origin: "user"`, `via: "swipe"`, no resolver call. The run request is unchanged (`via` is client-side only and stripped in `createRun`), so entity anchors go to `signal.interests.entities` and topic anchors to `signal.interests.tags` as before.

**Endpoints.** `POST /api/anchors/cards` (`CardsRequest` → `CardsResponse`) and `POST /api/anchors/cards/refill` (`RefillRequest` → `RefillResponse`). Both are validated with the shared schemas on both sides (400 with a plain message on bad input), sit under the global rate limiter, write nothing to the database and never log the body.

**Strategies** (measured in `docs/CARDS_PROBE.md`):
- **S, seeded and verified (chosen for the deck).** Hand-written seeds per business type in `server/anchors/seeds.ts` (8 brands, 6 artists, 4 topics; places only for the demo cities Manchester, London, Bristol), resolved ahead of time to exact ids by `npm run cards:seed` and committed in `server/anchors/seed-ids.json`. Anything ambiguous or unresolved is dropped, never guessed. 144 of 149 seeds resolved.
- **L, local popularity (not used).** `signal.location.query` changes results, but brands were not tailored to the business, "artists" included non-musicians, and places took 7 to 16 seconds.
- **R, refill (used).** After the third Yes, `GET /v2/insights` with `signal.interests.entities` (and `signal.interests.tags` for topic Yeses) set to the Yeses, for brands and artists. At most 3 refill cards go in after the top card, once per deck.

**Deck rules** (`buildDeck()` in `server/anchors/deck.ts`, every provider): target 14, minimum 8 (otherwise `unavailable`); mix 5 brands, 4 artists, 3 places, 2 topics, with missing places replaced by brands and topics (a place is never invented); no two cards of the same kind in a row and the first three are three kinds; names trimmed, over 48 characters dropped, duplicates (name or id) dropped, `server/anchors/blocklist.txt` terms dropped (one per line, whole-word match, edit freely), names equal to the business type dropped. Refills (`buildRefill()`) exclude every card already in the deck and the Yeses, return at most 6, and set `because` to the first liked seed's name.

**Provenance** (set by the server, rendered by the client, never claims more):

| `provenance` | Line on the card |
|---|---|
| `qloo_local` | Popular near {city} · From Qloo (not used today) |
| `qloo_seed` | Suggested for {business types} · Checked on Qloo |
| `qloo_refill` | Because you said yes to {because} |
| `snapshot` | Recorded example · From Qloo |
| `sample` | Sample card · Not from Qloo |

**Providers.** `qloo`: seeded deck with no live calls (budget allows 4), live refill with at most 2 calls through the shared client (limiter, retries, breaker, monthly floor, call log); when the floor is reached or the breaker is open the deck still works and the refill returns `unavailable`. `snapshot`: recorded decks for the three example (business type, city) pairs in `server/anchors/cards-snapshot.json`, `unsupported_city` for any other pair, refills recorded per liked id. `mock`: offline decks from the seed lists with `mock:<slug>` ids and `sample` provenance in every city; mock runs read `mock:` anchors by name against the demo catalog.

**Caching.** Decks per (business type, city) and refills per sorted liked ids are cached for 24 hours in memory (`server/utils/ttlCache.ts`); negative results for 10 minutes.

**Seeds.** `npm run cards:seed` (add `--dry-run` to count calls first, `--max-calls=N` to cap) resolves only what is not already in `seed-ids.json`, dedupes names across business types, matches exact names (Qloo names that differ are mapped in `QLOO_NAMES`), prefers `urn:tag:interests:qloo:*` for topics, stops at the quota floor, and re-records the snapshot decks and refills. The JSON files hold public ids only.

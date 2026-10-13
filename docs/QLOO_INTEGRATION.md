# Qloo integration

Venn talks to taste data only through `TasteProvider` in `server/providers/types.ts`. Set `TASTE_PROVIDER=qloo` and `QLOO_API_KEY` to use the real provider. Tests keep `TASTE_PROVIDER=mock`.

## Hackathon API

- Base URL: `https://hackathon.api.qloo.com` (`QLOO_BASE_URL`)
- Auth header: `X-Api-Key` (never send the key to the browser)
- Insights is **GET** `/v2/insights` with query params — not POST, not `/recs`
- See the [Qloo Agentic Hackathon Developer Guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide)

## Method to endpoint

| Provider method | Qloo surface |
| --- | --- |
| `resolveAnchors` | Entity search (`/search`) and tag search (`/v2/tags`) |
| `resolveCity` | `/search` for locality / place / destination; `hasLocalData` only when coordinates exist |
| `planKinds` | Local only. Map business type onto the nine partner kinds via `profiles.ts` |
| `discover` | Insights (`/v2/insights`) with `signal.interests.entities` and `filter.type` |
| `score` | Discover affinities plus reverse insights (partner as signal) |
| `enrich` | Trend tool trace; adds interpretation evidence when no trend payload exists |
| `heatmap` | Insights `filter.type=urn:heatmap`, with place-near-city fallback |
| `expand` | Insights seeded with the selected partner entity |

## Kind to `filter.type`

| Partner kind | Insights filter |
| --- | --- |
| music | `urn:entity:artist` |
| retail, fashion | `urn:entity:brand` |
| food, drink, venue, fitness, culture | `urn:entity:place` |
| wellness | `urn:entity:brand` |

## Rules

- The API key stays on the server. Read `QLOO_API_KEY` from the environment in `server/config.ts`.
- Validate responses with zod before they become `Partner`, `Heatmap`, or `ResolvedAnchor` fields.
- Cache insights per provider instance so expand / heatmap / reverse score do not repeat identical calls.
- Send only public entity and tag ids. Do not send personal data, customer lists, or individual behaviour.
- Evidence must say where a number came from. App-written sentences use origin `interpretation`.
- `city.hasLocalData` follows whether Qloo returned geography for the city, not the demo city table.

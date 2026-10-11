# Qloo integration

Venn talks to taste data only through `TasteProvider` in `server/providers/types.ts`. The mock provider is the one that ships. `QlooTasteProvider` in `server/providers/qloo/index.ts` has the same methods and currently rejects every call.

## Method to endpoint

| Provider method | Qloo surface |
| --- | --- |
| `resolveAnchors` | Entity search (`/search`) and tag search (`/v2/tags`) |
| `planKinds` | Local only. Map resolved tags onto the nine partner kinds. |
| `discover` | Insights (`/v2/insights`) with `signal.interests.entities` and `filter.type` |
| `score` | Insights filtered to the candidate entities, both directions |
| `enrich` | `bias.trends` and the entity trends endpoint |
| `heatmap` | Insights heatmap type, using neighbourhood boundaries |
| `expand` | Insights seeded with the selected partner entity |

## Rules

- The API key stays on the server. Read `QLOO_API_KEY` from the environment in `server/config.ts`. Never send it to the browser and never commit it.
- Validate every response with zod before it becomes a `Partner`, `Heatmap`, or `ResolvedAnchor`.
- Cache insights per run. Do not call Qloo again for a partner the run already scored.
- Send only public entity and tag ids. Do not send personal data, customer lists, or individual behaviour.
- Evidence must say where a number came from. If a sentence is written by the app rather than returned by Qloo, its origin is `interpretation`.
- The runner currently decides `city.hasLocalData` from the mock city list. When Qloo is wired, that flag should follow whether the insights call returned a local geography, not the demo city table.

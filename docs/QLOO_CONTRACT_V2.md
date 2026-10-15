# Qloo contract v2 (probe-backed)

Probed against `https://hackathon.api.qloo.com` on 2026-10-15 via `scripts/qloo-probe-v2.mjs` (23 calls). Fixtures in `server/providers/qloo/fixtures/v2/`. **Probe wins.**

| Capability | Endpoint / params | Works? | Fields we use | Limits / notes |
| --- | --- | --- | --- | --- |
| Host | hackathon base | yes | — | Production `api.qloo.com` returns **401** with hackathon key |
| Entity search | `GET /search` | yes | `results[]` entity_id, name, types, location | Aesop untyped: author ranked above brand — **confirm anchors** |
| Tags | `GET /v2/tags` | yes | tag id/name | `filter.parents.types` returned empty sample in probe |
| Insights entities | `GET /v2/insights` | yes | `results.entities`, `query.affinity`, popularity, tags | |
| **Rank together** | insights + `filter.results.entities` | **yes** | affinity on returned entities; 11/12 asked ids returned | **Phase 3 gate OPEN** |
| Analysis compare | `GET /v2/analysis/compare` | partial | `results.tags`, `a`, `b`, `matchEntities` | 200; tags may be empty depending on `filter.type` — degrade to tag intersection |
| Wrong compare path | `/v2/insights/compare` | no | — | 200 empty — do not use |
| Demographics | insights `filter.type=urn:demographics` | no / empty | `results.demographics` key present but empty | Hide age bands until non-empty fixture |
| Trending | `GET /v2/trending` | no | — | **400** on hackathon |
| Explainability | insights + `feature.explainability=true` | yes | `query.explainability.signal.interests.entities` | Free on discover |
| Heatmap | `filter.type=urn:heatmap` | yes | heatmap tiles affinity/popularity | |
| Place point+radius | `filter.location=POINT(lng lat)` + radius | yes | places with address/website/location | Prefer over location.query |
| Place location.query | `filter.location.query` | yes | places returned | May be looser than radius |
| `/entities` | GET | no | — | 400 |
| Quota headers | response headers | yes | `x-month-ratelimit-remaining`, `x-second-ratelimit-reset` | Seen ~9869 remaining on probe |

Auth: header `X-Api-Key` only.

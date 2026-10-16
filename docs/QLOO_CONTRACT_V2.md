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


## Anchor / tag probe (2026-10-15, 26 calls)

Probe script: `scripts/qloo-probe-anchors.mjs`. Fixture: `server/providers/qloo/fixtures/v2/anchors-probe-report.json`.

- jazz: search=200 ents=5; tags=200 n=8 names=Jazz |  Jazz | Jazz
- jazz music: search=200 ents=5; tags=200 n=8 names= Jazz | Jazz | Jazz
- food: search=200 ents=5; tags=200 n=8 names=Healthy Food | Food | Health Food
- natural wine: search=200 ents=5; tags=200 n=8 names=Natural Wine | Natural Wines | Natural Wine
- yoga: search=200 ents=5; tags=200 n=8 names=Yoga | Yoga | Yoga
- vinyl records: search=200 ents=5; tags=200 n=8 names=Vinyl Records | vinyl record | Vinyl Records
- specialty coffee: search=200 ents=5; tags=200 n=8 names=Specialty Coffee | Specialty Coffee | Specialty Coffee
- bookshop: search=200 ents=5; tags=200 n=8 names=Book Shop | Bookstores | Bookshop
- jazz tag=Jazz: baseline=0 signal=0 overlap=0.00 changes=true
- natural wine tag=Natural Wine: baseline=0 signal=0 overlap=0.00 changes=true
- yoga tag=Yoga: baseline=0 signal=0 overlap=0.00 changes=true
- operator tags=3: union=200/0 intersection=200/0
- compare tags: status=400 keys=none
- explainability+tags: status=200 hasExplain=true

**Build defaults from this probe:**
- Resolve topics via `GET /v2/tags` with `filter.query` + `feature.semantic_search=true&take=8` (all 8 probe words returned tags; dedupe by name).
- Discover sends `signal.interests.tags` with `operator.signal.interests.tags=union` alongside entities when the user confirmed tag anchors. (Bare place+POINT insights returned empty in this probe — production discover already pairs location with entity signals.)
- **Do not** send `a.signal.interests.tags` / `b.signal.interests.tags` on `/v2/analysis/compare` (400). Compare stays entity-only; UI may note that.
- `feature.explainability=true` with tag signals returns explainability fields (200) — safe on discover.

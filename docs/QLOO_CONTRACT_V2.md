# Qloo contract v2 (probe-backed)

Probed against `https://hackathon.api.qloo.com` on 2026-10-13 via `scripts/qloo-probe-v2.mjs`. Fixtures in `server/providers/qloo/fixtures/v2/` (redacted, no API keys). **Probe wins** over guessed shapes.

| Capability | Path / params | Status | Shape notes | Use in Venn |
| --- | --- | --- | --- | --- |
| Entity search (brand) | `GET /search?query&types&take` | 200 | `results[]` with `entity_id`, `name`, `types`/`subtype`, `tags`, `popularity` | Anchors, city, resolve |
| Entity search (artist) | same | 200 | same | Anchors |
| Location search | `/search` types `locality,place,destination` | 200 | `location.lat/lon`, locality preferred | `resolveCity` |
| Tags search | `GET /v2/tags?filter.query&take` | 200 | `results.tags[]` with `id`/`tag_id`, `name` | Keyword anchors |
| Insights entities | `GET /v2/insights?filter.type&signal.interests.entities` | 200 | `results.entities[]`; affinity in `query.affinity`; `query.measurements.audience_growth` | discover / score |
| Insights multi-signal (“compare”) | same with comma-joined entity ids | 200 | Same entity list shape — no separate compare payload | Dual-signal discover |
| Insights demographics | + `signal.demographics.audiences` | 200 | Still `results.entities` (audience param may be ignored if invalid) | Deferred / Phase 5.1 — verify audience URNs |
| Insights explainability | + `feature.explainability=true` | 200 | Per-entity `query.explainability["signal.interests.entities"]` | Evidence / Proof |
| Insights heatmap | `filter.type=urn:heatmap` + location query | 200 | `results.heatmap[]` with `location.latitude/longitude`, `query.affinity` | Map view |
| `/entities` | `GET /entities?filter.entity.id` | **400** | Error body — not usable as probed | Do not rely on |
| `/v2/entities` | `GET /v2/entities` | **404** | Missing | Do not rely on |
| Rate-limit headers | — | — | **None** observed on successful calls | Rely on 429 + `Retry-After` only |

## Auth

- Header: `X-Api-Key`
- Base: hackathon URL only

## Schemas

Zod passthrough schemas: `server/providers/qloo/schemas.ts` (also mirrored in `client.ts` helpers).

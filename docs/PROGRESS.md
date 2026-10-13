# Venn next-features progress

## Phase 0 — Audit, baseline, probe (2026-10-13)

- Baseline: `typecheck` / `test` (12) / `build` — green.
- Wrote `docs/NEXT_PROMPT.md`, `docs/NEXT_AUDIT.md`, `docs/QLOO_CONTRACT_V2.md`.
- Probe `scripts/qloo-probe-v2.mjs` → fixtures under `server/providers/qloo/fixtures/v2/` (no key material).
- Schemas: `server/providers/qloo/schemas.ts`.
- Probe findings: search/tags/insights/heatmap/explainability OK; `/entities` 400; `/v2/entities` 404; no rate-limit headers on 200s; multi-entity insights works as compare stand-in.
- Smoke: not re-run in Phase 0 (needs live server); prior session smoke OK with Qloo after 429 backoff.
- Env: `.env.example` extended for OpenAI / store / queue. Local `.env` sets `LLM_PROVIDER=openai`; **`OPENAI_API_KEY` must be filled locally** (key from chat treated as exposed — rotate in OpenAI dashboard).
- Chosen LLM model IDs (defaults): `gpt-4.1-mini` (brief + fast).

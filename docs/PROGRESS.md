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

## Phase 1 — Judge-proofing (2026-10-13)

- SQLite dual `RunStore`, scheduler, Qloo circuit breaker, expanded health, CSP on, `docs/DEPLOY.md`.
- Snapshots: `npm run snapshot`, `SnapshotTasteProvider`, `GET /api/examples`, `live: true` bypass.
- About dialog `#about` + footer; `QLOO_CAPABILITIES` + drift test.
- Config: OpenAI / queue / DATA_DIR / circuit env vars; `.env.example` updated.
- Tests: 21 passing.

## Phase 2 — OpenAI LLM briefs (2026-10-13)

- `server/llm/` openai / none / fake; health `llm.enabled` when key or fake.
- Evidence-cited AI briefs with validate/repair/template fallback + per-run budget.
- Brief UI: tone/length, regenerate, citation superscripts, editable outreach.
- Models: `gpt-4.1-mini`. Tests: 31 passing.
- Reminder: set `OPENAI_API_KEY` in local `.env` and rotate any key that appeared in chat.

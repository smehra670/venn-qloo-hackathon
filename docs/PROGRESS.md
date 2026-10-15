# Venn next-features progress

## Gap-fill Phase 0 — Re-probe (2026-10-15)

- Extended `qloo-probe-v2.mjs`; fixtures refreshed; `QLOO_COVERAGE.md` + `SCORING.md` + contract/audit updated.
- **Gate `filter.results.entities`: SUPPORTED** (11/12, affinities) → Phase 3 Proof rewrite proceeds.
- `/v2/analysis/compare` 200 with tags/a/b/matchEntities (tags often empty → degrade). Demographics empty. Trending 400. Prod host 401. Quota headers present (`x-month-ratelimit-remaining`). Aesop untyped → author first.
- Calls: 23.

## Gap-fill Phase 1 — Config / pacing (2026-10-15)

- `EXAMPLES_MODE`, Qloo RPS/in-flight/monthly floor, quota 429 on live runs, health/meta fields, `PUBLIC_REPO_URL`.

## Gap-fill Phase 2 — Model label (2026-10-15)

- Brief.`model` + UI chip; explicit LLM_PROVIDER boot checks; thin Anthropic adapter; OpenAI remains default working provider.

## Gap-fill Phase 3 — rankTogether Proof (2026-10-15)

- `DiscoverSpec` + `rankTogether`; Proof paired lists from one call per kind; Check via rankTogether; legacy fallback. Tests: 100.

## Gap-fill Phase 4 — Goals / anchors / feasibility (2026-10-15)

- GoalId wants/reach/appetite/avoid; Best for your goal; AgentDecision origins; feasibility tiers; POST /api/anchors/resolve + confirm UI. Tests: 126.

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

## Phase 3 — Proof + Check (2026-10-13)

- Frozen `normalization` on `RunResult`; shared scoring helper.
- Proof tab + `POST .../proof` (popularity vs AI baseline narrative).
- Check a partner + dashed “Your pick” nodes (cap 5); snapshots regenerated (mock).
- Tests: 42 passing.

## Phase 4 — Goals, decisions, feasibility (2026-10-13)

- Fine-tune goals UI; `goalFit` without changing match scores; top-pick display tiebreak.
- SSE `decision` events + “How Venn decided” panel; feasibility rules + optional LLM critic.
- Tests: 71 passing. Cut line (0–4) complete.

## After cut line (2026-10-13)

- **5.4** Usage ledger (SQLite counters; health + `/api/usage`).
- **6.4** Share links (`#share/<token>`, 7-day TTL snapshot).
- **5.1** Audience compare panel (signal-based; no fragile demographics URNs).
- Skipped 7.3 under pressure. Tests: 81 passing.

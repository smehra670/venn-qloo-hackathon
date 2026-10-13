# Venn — next features prompt (Phases 0–9)

Saved for execution without API keys. LLM choice for this repo: **OpenAI** (`LLM_PROVIDER=openai`, `OPENAI_API_KEY` in local `.env` only).

After each phase: `npm run typecheck`, `npm run test`, `npm run build`, commit `phase N: <title>`, append `docs/PROGRESS.md`. Probe wins over guessed Qloo shapes (`docs/QLOO_CONTRACT_V2.md`).

**Cut line for a strong submission:** complete Phases **0–4**. If time remains: **5.4 → 6.4 → 5.1 → rest of 5–9**; skip 7.3 first under pressure.

---

## Phase 0 — Audit, baseline, probe

1. Baseline: typecheck / test / build; note mock + Qloo smoke issues in PROGRESS.
2. Write `docs/NEXT_AUDIT.md` table covering: licence, store, snapshots, queue, CSP, LLM stub, evidence IDs, normalisation, Qloo budget, share, tests.
3. `scripts/qloo-probe-v2.mjs`: probe compare, demographics, trends, explanations, `/entities`, location search, rate-limit headers.
4. Redacted fixtures → `server/providers/qloo/fixtures/v2/`.
5. Zod passthrough schemas → `server/providers/qloo/schemas.ts`.
6. Contract table → `docs/QLOO_CONTRACT_V2.md`.
7. Grep fixtures for key prefixes before commit.

---

## Phase 1 — Judge-proofing

- About dialog (`#about`), footer, Qloo capability table in `shared/constants.ts` + drift test vs Qloo client paths.
- `RunStore`: memory + `better-sqlite3` SQLite (`DATA_DIR/venn.db`), migrations, restart marking, TTL, IP hash daily cap store.
- Snapshots: `npm run snapshot`, replay path, badge “Saved Qloo results · date”, `GET /api/examples`, `live: true` bypass.
- `RunScheduler`, circuit breaker on Qloo client, expanded `/api/health`, Helmet CSP on + self-hosted fonts, `docs/DEPLOY.md`, `smoke:remote`.
- Extend config Zod for all new env vars (OpenAI-flavoured defaults).

---

## Phase 2 — OpenAI LLM + evidence-cited briefs

- `server/llm/`: types, openai adapter (JSON schema), none, fake; health `llm: { enabled, provider }`.
- Facts / prompt / validate / ai writers; template remains fallback; brief route gains tone/length/regenerate + budget.
- UI: generator chip, tone/length controls, citation superscripts + Sources, editable outreach.
- Fake-LLM unit tests for invent/repair/fallback/injection.

---

## Phase 3 — Proof + Check a partner

- Persist `normalization` on `RunResult`; shared score-with-frozen-norm helper.
- `POST .../proof`, Proof view (4th tab), popularity baseline when LLM off / AI baseline when OpenAI on.
- `POST .../check`, dashed “Your pick” nodes, cap 5 user-added.
- Regenerate snapshots at end of phase.

---

## Phase 4 — Goals, decisions, feasibility

- Setup “Fine-tune” goals UI; `server/agent/goals.ts`; `goalFit` without changing match score.
- `ctx.decide` + SSE `decision`; Agent notes + “How Venn decided” panel.
- Feasibility rules + optional `llm.critic` via OpenAI fast model.

---

## After cut line (if time)

### 5.x Deeper Qloo / usage

- **5.1** Audience compare (demographics / segment overlap when probe confirms).
- **5.4** Usage ledger (local SQLite counters for Qloo + LLM calls).

### 6.x Share / workflow

- **6.4** Share links (signed or opaque tokens, TTL, read-only result view).

### 7–9

- Remaining polish, export, and judge-facing narrative; skip **7.3** first under time pressure.

---

## Secrets

- Never commit `.env` or live keys.
- Placeholders only in `.env.example`.
- Rotate any key that appeared in chat.

# Venn — next-features prompt (gap-fill track)

Full judging prompt provided in chat (2026-10-15). This file is the execution contract for the **gap-fill** track. Secrets never appear here.

## Locked decisions

- Cut-line gap-fill Phases 0–4 against the fuller prompt, then eligibility (1.3 + Phase 9 §1/4/5), then deepen 5.4→5.5→5.6→5.1→5.7. Plan board 6.1–6.3 only if time. Skip e2e and 7.3.
- Phase 0 probe gates Phase 3: `filter.results.entities` must work or Proof/Check stay hidden.
- LLM: OpenAI working provider; Anthropic only as explicit `LLM_PROVIDER=anthropic` thin adapter; no silent fallback; briefs record and show `model`.
- Probe wins over guessed Qloo shapes (`docs/QLOO_CONTRACT_V2.md`).

## Phase order

0. Re-probe + SCORING + COVERAGE (stop and report ranking gate before Phase 3 code)
1. Config pacing / EXAMPLES_MODE / monthly floor
2. Brief `model` label + boot key checks
3. DiscoverSpec + rankTogether Proof/Check **or** hide
4. GoalId Goals, anchors confirm, feasibility tiers
5. Eligibility: committed snapshots, hygiene, SUBMISSION_CHECKLIST
6. Deepen: call log, explainability, venues, compare, lift
7. Optional: Plan board 6.1–6.3

After each phase: `npm run typecheck`, `npm run test`, `npm run build`, commit `phase N: <title>`, append `docs/PROGRESS.md`.

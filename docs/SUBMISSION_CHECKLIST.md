# Venn submission checklist

Tick before Devpost / judging. Do not invent measured numbers — quote from `docs/EVAL.md` / live runs only when those exist.

## Hosted demo

- [ ] Live URL opens in an incognito window on desktop and phone
- [ ] A saved example finishes in under ~10 seconds and shows **Saved Qloo results · date**
- [ ] A free-form live search completes with `TASTE_PROVIDER=qloo`
- [ ] `/api/health` is green: `store` usable, `qloo` not permanently degraded, `qlooQuotaRemaining` (if present) above `QLOO_MONTHLY_FLOOR`
- [ ] Restart keeps finished runs (`GET /api/runs/:id`)
- [ ] Share link works in a private window (`#share/<token>`)
- [ ] Proof tab opens from the results header and shows real per-kind scores (not stuck on "Loading")
- [ ] Ask Venn answers a question grounded in the run, and the budget/no-key notes show correctly when forced

## Repo eligibility

- [ ] About dialog shows MIT and repo link (`#about`)
- [ ] GitHub About box shows the licence; repo is public
- [ ] `LICENSE` present; `package.json` has `"license": "MIT"` and `repository`
- [ ] Clean clone: `npm install` → `npm run typecheck` → `npm test` → `npm run build` → `npm run dev`
- [ ] `.env.example` has placeholders only; `.env` is gitignored
- [ ] Committed snapshots under `server/snapshots/` contain no API keys (grep for `hack_`, `sk-`)

## Product honesty

- [ ] Limitations text in About and README
- [ ] Proof / Check only when ranking is available; otherwise calm disabled note
- [ ] Nothing in the product says "AI" or names a model — briefs and chat are attributed to Venn only
- [ ] No customer data claimed; scores described as relative / group-level

## Secrets (operator)

- [ ] `QLOO_API_KEY` set on host (never in repo)
- [ ] `OPENAI_API_KEY` set only if `LLM_PROVIDER=openai` (or set `LLM_PROVIDER=none`)
- [ ] Rotate any key that ever appeared in chat
- [ ] Volume mounted for `DATA_DIR` in production
- [ ] `PUBLIC_REPO_URL` set if About should deep-link your fork

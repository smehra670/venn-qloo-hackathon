# Venn next-features audit + name mappings

Baseline revisited 2026-10-15. Earlier Phase 0–4 cut line is **shipped**; this table tracks gaps vs the fuller prompt.

| Item | Exists? | File(s) | Note / mapping |
| --- | --- | --- | --- |
| About / licence | yes | `LICENSE`, `AboutDialog.tsx`, `package.json` | Extend meta via `PUBLIC_REPO_URL` |
| Persistent store | yes | `server/runs/store.ts` | SQLite + memory; no separate `briefs`/`run_extras` tables yet |
| Snapshots | partial | `server/providers/snapshot/`, `scripts/snapshot.ts` | `TASTE_PROVIDER=snapshot` ↔ prompt `EXAMPLES_MODE=snapshot`; commit under `server/snapshots/` |
| Queue / IP cap / circuit | yes | `scheduler.ts`, store daily_caps, qloo client | Add RPS / monthly floor |
| CSP / fonts | yes | `server/app.ts`, `@fontsource` | |
| LLM | yes | `server/llm/` | OpenAI; `generatedBy` ↔ show `model`; Anthropic optional explicit only |
| Brief evidence IDs | yes | `server/brief/facts.ts`, `validate.ts` | Keep |
| Match score stretch | yes | `scoring.ts` | Documented in `SCORING.md`; Proof must use rankTogether |
| Proof / Check | partial | `server/proof.ts` | Offline popularity stretch → replace with rankTogether (gate OPEN) |
| DiscoverSpec | no | — | Add in Phase 3 |
| Goals GoalId | no | `FineTune.tsx` uses preferLocal/budget | Migrate to wants/reach/appetite/avoid |
| Anchors confirm | no | resolve inside run only | Add `POST /api/anchors/resolve` |
| Feasibility tiers | partial | `{ ok, notes }` | Map to easy/warm_intro/long_shot |
| Share | yes | `/api/share/:token` | Prompt path `/api/shared/:slug` — keep unless checklist needs rename |
| Compare | partial | signal-based `server/compare.ts` | Prefer `/v2/analysis/compare` when tags non-empty |
| Call log panel | partial | usage ledger only | Per-run `QlooCallRecord` still needed |
| Venue facts / pins | no | — | Phase 5.6 |
| Trending / demographics | no | probe unsupported/empty | Hide / degrade |

## Probe gate (2026-10-15)

- **rankTogether (`filter.results.entities`): SUPPORTED** (11/12 ids, affinities present)
- analysis/compare: endpoint 200 with `tags|a|b|matchEntities` — tags may be empty; degrade OK
- demographics: empty — hide age bands
- trending: 400 — hide trend UI
- Aesop untyped → author first — confirm UI required

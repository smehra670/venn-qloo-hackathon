# Venn next-features audit (Phase 0)

Baseline: `npm run typecheck`, `npm test`, `npm run build` — all green (2026-10-13).

| Area | Current state | Gap for Phases 1–4 |
| --- | --- | --- |
| Licence | MIT `LICENSE` + `"license": "MIT"` + repository URL in `package.json` | About dialog should surface licence + repo |
| Store | In-memory `Map` in `server/runs/store.ts`, 1h TTL, max 300 runs | SQLite (`better-sqlite3`) + memory dual store, restart-safe, IP daily cap |
| Snapshots | None | `npm run snapshot`, replay provider, badge, `/api/examples`, `live: true` |
| Queue | Direct `executeRun` on POST | `RunScheduler` with concurrency + queue depth |
| CSP | Helmet registered; `contentSecurityPolicy: false` (map tiles) | Enable CSP allowing self + CARTO/OSM tile hosts; fonts already `@fontsource` |
| LLM stub | `server/brief/llm.ts` rejects “Not configured” | Full `server/llm/` + OpenAI JSON-schema briefs |
| Evidence IDs | Labels/strings on `EvidenceItem`; no stable IDs | Stable evidence ids for citations in AI briefs |
| Normalisation | `stretchScores` in Qloo/mock mapping; not persisted | Persist `normalization` on `RunResult` for Proof/Check |
| Qloo budget | Per-request retry on 429; no circuit breaker / global budget | Circuit breaker + health fields + optional call budget |
| Share | None | Phase 6.4 if time |
| Tests | 12 unit/integration tests, mock provider | Drift tests, fake-LLM, store/scheduler, proof/check |

## Provider notes

- Mock path is the CI default (`TASTE_PROVIDER=mock` in tests).
- Live Qloo uses `https://hackathon.api.qloo.com` + `X-Api-Key`.
- Smoke (`npm run smoke`) needs a running server; Qloo can 429 under concurrency.

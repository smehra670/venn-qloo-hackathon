# Venn - Qloo Hackathon Submission

Venn finds the businesses whose audiences overlap with yours, draws that overlap on a map and a chart, and writes the collab pitch. Built for the Qloo Agentic Hackathon 2026.

## Run it

```bash
cp .env.example .env
npm install
npm run dev
```

(Windows: `copy .env.example .env` instead of `cp`.)

Open http://localhost:5173 — the API listens on http://localhost:8787, and Vite proxies `/api` including the live event stream. No API keys needed: `TASTE_PROVIDER` defaults to `mock`, and the three built-in examples replay saved real Qloo results either way (`EXAMPLES_MODE=snapshot`). Set `TASTE_PROVIDER=qloo` and `QLOO_API_KEY` for live data; see "Environment" below.

## What it does

- You describe a business in one sentence: type, city, and a few things customers love — or build that list by swiping a deck of Qloo-checked taste cards instead of typing.
- An agent resolves those anchors against Qloo's taste graph, plans which kinds of partner to look for, discovers candidates, scores the overlap, and assembles a shortlist. Every step streams live, and the actual Qloo calls are shown as they happen (`docs/ANCHORS.md`).
- Results open on an Overview dashboard — a taste-overlap chart, a neighbourhood map, audience-compare bars — plus a sortable Shortlist. Press or drag a shared taste to light it up across every chart at once.
- A Proof tab ranks Venn's picks against an obvious baseline, in the same Qloo call, so the comparison is fair — plus a "check a partner" box for one of your own.
- Each partner has a one-page collaboration brief: a concept, a two-week plan, and an editable outreach email. Briefs are written by an LLM from the run's own evidence when one is configured, and fall back to a deterministic template otherwise — nothing in a brief is invented either way.
- "Ask Venn" is a chat panel for free-form questions about the finished search, grounded the same way the brief is — it says "I don't know" rather than guess when something isn't in the data.
- Results can be shared as a read-only link. `TASTE_PROVIDER` switches between live Qloo, saved Qloo snapshots (for the built-in examples), and an offline demo catalog, so the app runs with no keys at all.

## Architecture

```
Setup  ->  POST /api/runs  ->  SSE /events  ->  runner
                                              |
                                              v
                                        TasteProvider
                                   (mock | qloo | snapshot)
                                              |
                                              v
                   Results: overview, map, shortlist, proof, brief
```

The browser only talks to `/api`. Shared types in `shared/` are the contract for both the Fastify server and the Vite client.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite and the API together |
| `npm run typecheck` | App and server, no emit |
| `npm test` | Vitest |
| `npm run build` | Client bundle and server bundle |
| `npm start` | Production server |
| `npm run smoke` | Hits a running server end to end: swipe cards, a run, heatmap, brief |
| `npm run e2e:swipe` | Swipe-to-build-your-crowd flow at 1440px and 390px against a running mock app |
| `npm run cards:seed` | Resolves swipe-card seeds to exact Qloo ids (`server/anchors/seed-ids.json`) |
| `npm run snapshot` | Captures saved Qloo results for the built-in examples |
| `npm run og` | Regenerates `public/og.png` |

## Environment

See `.env.example` for the full list and defaults.

- `PORT`, `HOST` — API bind address. Production reads `PORT` from the host.
- `TASTE_PROVIDER` — `mock` (default, no keys needed), `qloo` (live, needs `QLOO_API_KEY`), or `snapshot` (replays saved Qloo results).
- `MOCK_LATENCY` — `normal`, `fast`, or `off`.
- `TRUST_PROXY`, `RATE_LIMIT_MAX`, `RATE_LIMIT_RUNS_PER_MIN`, `DAILY_RUN_CAP_PER_IP` — request limits.
- `QLOO_API_KEY`, `QLOO_BASE_URL` — required for `TASTE_PROVIDER=qloo`. Hackathon keys only work against `https://hackathon.api.qloo.com`.
- `LLM_PROVIDER` — `openai`, `anthropic`, or `none` (default). Needs a matching `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Briefs fall back to the template writer when this is unset.

## Deployment

The production server serves `dist/client` and the API from one process. Set `PORT`. Do not buffer `text/event-stream`; the Vite proxy already sets `timeout` and `proxyTimeout` to 0, and a reverse proxy needs the same. Finished runs are kept in SQLite (`DATA_DIR`, default `RUN_TTL_HOURS=24`) so a restart doesn't lose them, but a host that sleeps mid-search will still drop that one in-flight request.

```bash
docker build -t venn .
docker run --rm -p 8787:8787 -e TASTE_PROVIDER=mock venn
```

Platform notes (Railway, Fly.io, required volumes) are in [docs/DEPLOY.md](docs/DEPLOY.md).

## Decisions

- The dev script passes `--tsconfig tsconfig.server.json` so `tsx` can resolve `@shared`. The root `tsconfig.json` only holds project references.
- TypeScript 7 rejects `baseUrl`. Path mappings are relative (`./shared/*`, `./src/*`).
- `tsup` does not resolve TypeScript paths, so `tsup.config.ts` maps `@shared/*` onto `shared/*.ts`.
- Provisional discovery ranks by unjittered popularity. The final local-popularity jitter is a seeded value per candidate id, so order does not change scores.
- Catalog trend values are clamped from -0.3 to 0.4 and then mapped linearly onto 0–1.
- The audience profile and the business-side profile are both divided by their max weight before cosine similarity.
- Partner centres stay at least one pixel outside the business circle. Overlap still grows with the match score through radius and the lens formula. The first kind sits at the top, and partners of one kind fan by 0.22 radians.
- Fuzzy name matches lose to a synonym unless the Fuse score is 0.12 or lower, so a word like "pilates" stays an interest.
- Expand adds as many partners as fit under the cap of 28. An empty addition returns a short message.
- The form requires one anchor. The shared schema is the same rule.
- `framer-motion` 14 stayed on `framer-motion`. Geist variable fonts resolved, so the UI did not fall back to Inter.
- Manchester and New York neighbourhoods use the same style of character tags as London. The spec only listed coordinates.
- An unknown city returns `city: null` and a limits note. It does not invent a city record.
- The graph SVG is `role="group"` so circles stay focusable. The shortlist is the accessible list of the same partners.
- A kind filter hides a partner on the graph even if that partner is pinned. Pinned partners still appear in the shortlist.
- Mock `hasLocalData` uses the demo city table. Qloo `hasLocalData` follows whether `/search` returned geography for the city.
- Hackathon Qloo calls use `https://hackathon.api.qloo.com` with the `X-Api-Key` header. `TASTE_PROVIDER=qloo` requires `QLOO_API_KEY`.
- Helmet ships with CSP off because the map uses CARTO tiles. The theme is light only.
- The blue token used for text and focus is `#3E49E6`. Circle fills stay `#FF6B57`, `#4F5BFF`, and `#6B3FA0`.
- `sharp` is installed, but its native binary is blocked by Windows Application Control on this machine. `npm run og` draws `public/og.png` with Node's built-in zlib instead.
- Usage ledger: `server/usage/ledger.ts` owns a small `usage_counters` SQLite table (same `DATA_DIR`) tallying Qloo HTTP calls and LLM completion calls per UTC day. Counted at the call site (`qlooGet`, `OpenAiLlmClient.send`), so every real outbound call is tallied regardless of which route triggered it. Surfaced on `/api/health` (`usage.qlooToday`/`llmToday`) and `GET /api/usage` (14-day history).
- Share links: `POST /api/runs/:id/share` snapshots the finished `RunResult` into a `shares` table under a fresh opaque token (TTL 7 days), rather than pointing back at the live run — runs themselves expire after `RUN_TTL_HOURS` (24h by default), well inside the share window. `GET /api/share/:token` reads that snapshot only; it never mutates or re-scores anything. The client uses a `#share/<token>` hash route so no server-side routing changes were needed.
- Audience compare: `POST /api/runs/:id/compare` builds its payload purely from signals already computed during scoring (`server/compare.ts`) instead of issuing a new Qloo probe — the score step already blends a forward and reverse affinity call, so repeating that would just be the same network round trip again. Deterministic for every provider, including mock.

## Responsible use

Match scores compare groups of taste for this search. They are relative to the other partners in the same run. They are not a claim about any person, and this demo does not use customer data. Briefs are written from the run's own evidence — or a deterministic template when no LLM is configured — never invented either way, but they're a starting point to edit, not something to send unread.

## Taste data

Set `TASTE_PROVIDER=qloo` and `QLOO_API_KEY` to use live Insights. Details are in [docs/QLOO_INTEGRATION.md](docs/QLOO_INTEGRATION.md).

## License

MIT — see [LICENSE](LICENSE).

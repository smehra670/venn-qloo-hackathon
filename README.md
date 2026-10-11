# Venn

Venn finds the businesses whose audiences overlap with yours, draws that overlap as a graph, and writes a collab brief.

## What it does

- You describe a business in one sentence: type, city, and a few taste anchors.
- An agent resolves those anchors, plans partner kinds, discovers candidates, scores the overlap, and assembles a shortlist.
- Results show a Venn graph, a neighbourhood map for the demo cities, a sortable shortlist, and a one-page brief you can copy or print.
- Every taste number in this build comes from the mock provider and is labelled **Demo data**.

## Architecture

```
Setup  ->  POST /api/runs  ->  SSE /events  ->  runner
                                              |
                                              v
                                        TasteProvider
                                         (mock today)
                                              |
                                              v
                         Results: graph, map, shortlist, brief
```

The browser only talks to `/api`. Shared types in `shared/` are the contract for both the Fastify server and the Vite client.

## Setup (Windows)

```powershell
copy .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. The API listens on http://localhost:8787. Vite proxies `/api`, including the live event stream.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite and the API together |
| `npm run typecheck` | App and server, no emit |
| `npm test` | Vitest |
| `npm run build` | Client bundle and server bundle |
| `npm start` | Production server on port 8787 |
| `npm run smoke` | Hits a running server with the London cafe example |
| `npm run og` | Regenerates `public/og.png` |

## Environment

See `.env.example`.

- `PORT`, `HOST` — API bind address. Production reads `PORT` from the host.
- `TASTE_PROVIDER` — `mock` in this build. `qloo` fails until that provider is implemented.
- `MOCK_LATENCY` — `normal`, `fast`, or `off`.
- `TRUST_PROXY`, `RATE_LIMIT_MAX`, `RATE_LIMIT_RUNS_PER_MIN` — request limits.
- `QLOO_API_KEY`, `LLM_PROVIDER`, `LLM_API_KEY` — reserved. Unused.

## Deployment

The production server serves `dist/client` and the API from one process. Set `PORT`. Do not buffer `text/event-stream`; the Vite proxy already sets `timeout` and `proxyTimeout` to 0, and a reverse proxy needs the same. A host that sleeps will drop an in-flight search because runs live in memory for 60 minutes.

```powershell
docker build -t venn .
docker run --rm -p 8787:8787 -e TASTE_PROVIDER=mock venn
```

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
- Demo `hasLocalData` is decided in the runner from the mock city table. See `docs/QLOO_INTEGRATION.md` for the Qloo follow-up.
- Helmet ships with CSP off because the map uses CARTO tiles. The theme is light only.
- The blue token used for text and focus is `#3E49E6`. Circle fills stay `#FF6B57`, `#4F5BFF`, and `#6B3FA0`.
- `sharp` is installed, but its native binary is blocked by Windows Application Control on this machine. `npm run og` draws `public/og.png` with Node's built-in zlib instead.

## Responsible use

Match scores compare groups of taste for this search. They are relative to the other partners in the same run. They are not a claim about any person, and this demo does not use customer data. Briefs are templates. Check them before you send one.

## Taste data

How a real Qloo provider would replace the mock is written in [docs/QLOO_INTEGRATION.md](docs/QLOO_INTEGRATION.md).

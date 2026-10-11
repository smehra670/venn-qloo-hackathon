# What was coded

Venn is a single npm package. The browser and the API share one TypeScript contract in `shared/`. The API is a Fastify server. The interface is a React app built with Vite. All taste numbers in this build come from a mock provider. A Qloo provider exists only as a stub with the same methods.

The browser never talks to taste data directly. It only calls `/api`.

## How a search runs

1. Setup collects a business type, an optional name, a city, and one to six taste anchors.
2. The client posts that input to `POST /api/runs` and opens a Server-Sent Events stream at `GET /api/runs/:id/events`.
3. The runner walks seven steps: resolve, plan, discover, score, enrich, adapt, assemble.
4. Each step calls `TasteProvider`. Today that is `MockTasteProvider`.
5. The stream ends with a `RunResult`: partners, three top picks, a headline, and city info.
6. Results draws a Venn graph, a neighbourhood map, a shortlist, and a one-page brief.

```
Setup → POST /api/runs → SSE /events → runner → TasteProvider
                                              ↓
                         Graph, map, shortlist, brief
```

## Package and tooling

`package.json` is named `venn`, private, MIT, ES modules, Node `>=22.19.0`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite on 5173 and the API on 8787, together |
| `npm run build` | Client bundle in `dist/client`, server bundle in `dist/server` |
| `npm start` | Production server, one process for the API and the built client |
| `npm run typecheck` | `tsc` for the app and the server, no emit |
| `npm test` | Vitest |
| `npm run smoke` | Hits a running server with the London café example |
| `npm run og` | Writes `public/og.png` |

Configs:

- `tsconfig.json` only holds project references. TypeScript 7 has no `baseUrl`, so path mappings in the app and server configs are relative (`./shared/*`, `./src/*`).
- `vite.config.ts` proxies `/api` to `http://localhost:8787` with `timeout: 0` and `proxyTimeout: 0` so the event stream is not buffered.
- `tsup.config.ts` bundles `server/index.ts` and maps `@shared/*` onto `shared/*.ts`, because tsup does not resolve TypeScript paths.
- `vitest.config.ts` and `vitest.setup.ts` set `MOCK_LATENCY=off` and `TASTE_PROVIDER=mock` before any import. dotenv does not override variables that are already set.
- The dev script passes `--tsconfig tsconfig.server.json` so `tsx` can resolve `@shared`.

## Shared contract

`shared/types.ts` is the source of truth.

- 13 business types, including `other`.
- 9 partner kinds: food, drink, venue, music, culture, retail, fashion, fitness, wellness.
- Entity types such as brand, place, artist, podcast, and movie.
- The seven step ids, in order.
- `BusinessInput`, `ResolvedAnchor`, `Partner`, `TopPick`, `CityInfo`, `RunResult`, `Heatmap`, `Brief`, and the agent event union used on the stream.
- `Partner` carries a match score, a surprise score, shared tags, a signal breakdown, evidence items marked `data` or `interpretation`, and related partner ids.

`shared/schemas.ts` validates the same shapes with Zod. `BusinessInputSchema` requires `businessTypeCustom` when the type is `other`, keeps one to six anchors, and strips control characters. `AgentEventSchema` is what the client uses to parse each SSE message.

`shared/constants.ts` holds business-type labels, step titles, `MAX_PARTNERS` (28), demo limits, and the unknown-city limit.

## Server

`server/index.ts` loads config, listens on `HOST`:`PORT`, and on `SIGINT` or `SIGTERM` aborts in-flight runs and closes the process.

`server/config.ts` reads the environment with Zod. `TASTE_PROVIDER=qloo` fails at startup with "The Qloo provider is not implemented yet. Set TASTE_PROVIDER=mock." `TRUST_PROXY` is an enum of `true`, `false`, `1`, and `0`, because a boolean coerce would treat the string `"false"` as true.

`server/app.ts` builds Fastify 5:

- Helmet with Content-Security-Policy off, so Leaflet can load CARTO map tiles. Cross-origin embedder policy is also off.
- A global rate limit, plus a tighter limit on `POST /api/runs`.
- JSON body limit of 8kb.
- In production, `@fastify/static` serves `dist/client`, with a fallback to `index.html` for client routes.
- Errors are returned as JSON. The store is disposed when the app closes.

### Routes

`server/routes/health.ts`

- `GET /api/health` returns ok, the provider name, the label ("Demo data" for mock), and the package version.
- `GET /api/meta` returns the three built-in examples and the demo cities.

`server/routes/runs.ts`

- `POST /api/runs` validates the body and starts a run. The response is `{ runId }`.
- `GET /api/runs/:id/events` is the live stream. The reply is hijacked, replay starts from `Last-Event-ID` or `?lastEventId=`, a comment heartbeat is written every 15 seconds, and the stream closes on result, error, or cancel. Closing the browser tab does not cancel the run.
- `GET /api/runs/:id` returns status, result, and error, so a refresh can restore a search.
- `DELETE /api/runs/:id` aborts the run and appends `cancelled` immediately, so the runner does not emit a second terminal event.
- `POST /api/runs/:id/expand` adds related partners up to the cap of 28, then the client refetches the run so related ids stay in sync.
- `GET /api/runs/:id/heatmap` returns a heatmap, or 204 when the city has no local demo data. The result is cached on the run.
- `POST /api/runs/:id/brief` renders a template brief and caches it by partner and variant.

Expired runs answer with "That search has expired. Start a new one."

### Run store and runner

`server/runs/store.ts` keeps runs in memory. Ids are 12-character nanoids. A run lives for 60 minutes. The store holds at most 300 runs and prunes on a timer that does not keep the process alive. `append` stamps each event with an id and a time and notifies SSE subscribers.

`server/runs/runner.ts` is the agent. It does not precompute a plan. It calls provider methods so a future Qloo provider can replace the mock without rewriting the route layer.

| Step | What happens |
| --- | --- |
| resolve | Turn each anchor into a matched entity, a keyword, or a guess |
| plan | Choose six partner kinds from the resolved taste |
| discover | Search each kind, three at a time, and keep a pool of at most 22 candidates |
| score | Turn candidates into partners with match scores |
| enrich | Attach trend notes for the top 12. Scores do not change |
| adapt | If fewer than 12 partners have a strong raw score, widen to two more kinds and rescore, still capped at 28 |
| assemble | Pick the top partners per kind, choose three highlights, and write the headline |

Logs record run id, provider, business type, city, anchor count, and elapsed time. They do not record the anchor text. Failures become a short message. The stack is not sent to the client. An unknown city gets a step note.

Demo city detection uses the mock city table inside the runner. That is the one place a Qloo follow-up would change `hasLocalData`. See `docs/QLOO_INTEGRATION.md`.

`server/runs/trace.ts` sleeps before each traced tool call. Latency is `normal` (250–700ms), `fast` (60–150ms), or `off` (0). The sleep uses an unseeded random value, so timing is not part of the score.

## Mock taste engine

`server/providers/types.ts` defines `TasteProvider` and a `Candidate` (a catalog entry, whether it is local, and a provisional rank).

`server/providers/index.ts` returns one provider for the process. The mock is the live one. The Qloo class is wired but never selected while the config rejects `qloo` at startup.

### Data

`server/providers/mock/taxonomy.ts` has 52 taste tags, display labels, and more than 80 synonyms. Lookup tries the full phrase, then tokens, then bigrams.

`server/providers/mock/profiles.ts` maps each business type to the tags that describe its customers.

`server/providers/mock/cities.ts` has neighbourhoods for London, Manchester, and New York, plus aliases such as NYC and Greater Manchester. Matching is exact and case-insensitive. Manchester and New York neighbourhoods were given character tags in the same style as London.

`server/providers/mock/catalog.ts` has about 74 entries: global brands and fictional local places. Every demo city has local rows. Locals are invented venues. Global names are real brands used only as descriptive catalog rows.

### Scoring

`server/providers/mock/engine.ts` is pure and is what the unit tests call.

- Names and aliases match first. Fuse.js fuzzy-matches the rest at threshold 0.28. If a synonym exists and the fuzzy score is worse than 0.12, the word stays a keyword. That is why "pilates" is an interest and not the venue Slow Studio Pilates.
- A seeded mulberry32 value is derived per candidate id from the business type, city, and sorted anchors. Jitter does not depend on list order. Provisional ranking uses popularity before that jitter.
- Audience profiles on both sides are divided by their max weight, then compared with cosine similarity. Tag overlap uses Jaccard. Catalog trend is clamped from −0.3 to 0.4 and mapped onto 0–1.
- Raw scores in a search are stretched onto 52–96. If every raw score is equal, the match score is 74.
- Local places whose kind equals the business category are dropped, so a London café does not get other local cafés as partners. Brands of the same kind are allowed.
- Unknown cities get no local rows and a tighter result limit.
- Surprise groups food with drink, music with venue and culture, fashion with retail, and fitness with wellness. A partner is marked surprising when its surprise is at least 0.6 and its match is at least the median.
- The first two kinds keep their top 4 partners. Later kinds keep their top 3.
- Related ids are recomputed for the full set after expand.
- Heatmaps score each neighbourhood from the partner's taste against that neighbourhood's character tags.

`server/providers/mock/index.ts` implements the provider. Its label is "Demo data". Traced tools are `search_entities`, `search_tags`, `get_insights`, `score_shortlist`, `get_trends`, and `get_heatmap`.

`server/providers/qloo/index.ts` implements the same methods and rejects every call. Comments name the Qloo endpoints each method would use. The API key is never read by the browser.

## Briefs

`server/brief/template.ts` has three written variants for each of the nine partner kinds (27 in total). Placeholders fill in the business, partner, two tags, city, and neighbourhood. A brief includes a concept, why it fits, a first step, a two-week plan, what to measure, risks, and an outreach email. `generatedBy` is `"template"`.

`server/brief/llm.ts` is a writer whose `write` method rejects with "Not configured". No model is called.

## Client

`src/main.tsx` mounts React and loads Fraunces, Geist, and Geist Mono variable fonts. `src/index.css` is the design system: paper background, coral for you, blue for them, plum for the overlap, focus rings, reduced motion, and print CSS that shows only `#brief-print`.

`src/App.tsx` boots the store once, then shows Setup, Research, or Results. Toasts use the paper card style.

### State

`src/store/useVenn.ts` is a Zustand store.

- Stages: setup, researching, results.
- It restores the last form from `localStorage` (`venn:input`) and the last run from `sessionStorage` (`venn:runId`).
- A finished run comes back as results. A running search resumes the event stream. A missing run clears the saved id.
- On a result, the screen waits 600ms (0ms when reduced motion is on) and then shows results.
- The store also holds the selected partner, hover, pins, surprise slider, kind filter, the graph/map/shortlist view, brief cache, and heatmap cache.

`src/lib/api.ts` is the typed fetch wrapper. Responses are parsed with the shared Zod schemas. A 204 becomes `null`. `src/lib/sse.ts` wraps `EventSource`, sends the last event id, and parses each message with `AgentEventSchema`.

### Setup

`SetupScreen` is one sentence: business type, optional name, city, and anchors. Example chips fill the three demos with a short stagger. The city field suggests London, Manchester, and New York but accepts any city. The form requires at least one anchor. The badge says "Demo data" while the provider is mock.

### Research

`ResearchScreen` shows the seven steps, an animated pair of circles, and the tool log. Cancel calls `DELETE` and returns to the form. A failed run offers try again and edit. The tool log prefixes mock calls so they read as demo lookups.

### Results

`ResultsScreen` shows the headline, a note that scores are relative to this search and describe groups rather than individual customers, and three views. On small widths the view switch sits in a bottom tab bar. Escape closes the brief first, then the drawer.

`VennGraph` draws an SVG. The business circle is fixed. Partner circles sit outside it. Distance and radius follow the match score, and the lens where they overlap is plum, clipped with `clipPath`. Layout is `d3-force` for 300 synchronous ticks in `useGraphLayout.ts`. Zoom uses `d3-zoom` on a ref, not React state. The kind legend filters the graph. The surprise slider keeps the top 14 partners, plus any pinned or selected partner whose kind is still on. The SVG is `role="group"` so the circles stay keyboard-focusable. The shortlist is the accessible list of the same partners. Labels sit radially outside each circle for the strongest partners, or for any circle while zoomed, hovered, or selected.

`TopPicks` shows best overall, best local fit, and wildcard.

`PartnerDrawer` opens on a circle or a card. It shows the match ring, reasons, shared tags, evidence split into "From the taste data" and "Venn's interpretation", related partners, pin, expand, and the brief action.

`MapView` uses Leaflet and CARTO light tiles. Demo cities get two glowing circles per neighbourhood (coral for you, blue for them) and numbered markers for the top three overlaps. A side list flies the map to a neighbourhood. Any other city shows: "Map preview is available for London, Manchester and New York in demo mode."

`ShortlistView` lists every partner, with a separate "Your shortlist" section for pins. Sort is match, surprise, or name. Download CSV builds the file in the browser.

`BriefSheet` loads a cached brief, copies the page or the outreach email, prints with the print stylesheet, and cycles the three concepts.

## Tests and scripts

`server/providers/mock/engine.test.ts` checks taxonomy membership, 52 tags, the synonym count, six planned kinds, deterministic scores in the 52–96 range, at least 12 partners, no local café competing with a London café, an unknown city with no locals, three brief formats per kind, and the Aesop / pilates / unknown-anchor resolution cases.

`server/app.test.ts` posts the London café example through Fastify inject, waits until the run is done, and checks the partner count, three top picks, a heatmap, and a template brief.

`scripts/smoke.mjs` does the same against a live server: read the SSE stream until `result`, require at least 12 partners and 3 top picks, then fetch the heatmap and a brief. It cancels the stream and exits so the process does not wait on the keep-alive connection.

`scripts/make-og.mjs` writes a 1200×630 PNG of the two circles, the word Venn, and the tagline. It uses Node's zlib because the `sharp` native binary is blocked by Windows Application Control on the machine this was built on. `sharp` is still installed.

## Deploy

`Dockerfile` is a three-stage Node 22 image: install, build, then a production image that runs as `node`, exposes 8787, and health-checks `/api/health`. `.dockerignore` skips `node_modules`, `dist`, `.git`, env files, and logs.

`.env.example` documents `PORT`, `HOST`, `TASTE_PROVIDER`, `MOCK_LATENCY`, rate limits, and the unused `QLOO_API_KEY` and LLM keys. `.env` is gitignored.

## What is deliberately not built

- No live Qloo calls. Every Qloo method rejects.
- No LLM briefs. The template writer is the only writer.
- No customer data, accounts, or personal profiles. Scores compare groups for one search and are relative to the other partners in that search.
- No chat box. The only input is the setup sentence.

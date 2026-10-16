# Venn — full feature guide

Venn is a taste-collaboration agent. You describe a business in one sentence. It finds other brands, artists, and places whose audiences overlap with yours, draws that overlap as a literal Venn diagram, and writes a one-page collab brief you can copy or print.

This document describes what the product can do end to end: the three screens, the agent pipeline, taste providers, results tools, API, accessibility, and ops.

---

## Product idea in one paragraph

Most “find a partner” tools start from industry or follower count. Venn starts from **taste**: brands, artists, and interests your customers already care about. It treats those as public signals (never customer lists), scores group-level overlap relative to the current search, and turns the strongest matches into a pitch. Scores are relative to the partners in that run (stretched into a readable 52–96 band). They are not claims about any individual person.

---

## Three screens

### 1. Setup

The home screen is a sentence form, not a multi-step wizard:

> I run a **[type]** called **[optional name]** in **[city]**. My customers love **[anchors]**.

**Business type** — one of:

- café, restaurant, bar, music venue, gym or studio, shop, fashion brand, bakery, bookshop, salon or spa, hotel, coworking space, or “other” (with a short custom description)

**Business name** — optional (e.g. Brew & Co). Used in headlines and briefs when present.

**City** — free text with demo-city suggestions (London, Manchester, New York). Any city works; local map / neighbourhood data depends on the taste provider and geography.

**Anchors** — one to six things your customers love (brands, artists, places, interests). Features:

- Chip list with remove
- Enter or comma to add
- Paste comma-separated lists
- Backspace on empty draft removes the last chip
- Duplicate detection (case-insensitive)
- Length checks (2–60 characters)
- Rotating placeholders (Aesop, Radiohead, pilates, …)

**Example chips** — one click fills a full example, then staggers the anchors in:

1. Brew & Co — café in London — Aesop, Radiohead, pilates  
2. Gym or studio in Manchester — Patagonia, craft beer, bouldering  
3. Second Spin Records — shop in New York — Bandcamp, Polaroid, natural wine  

**Per-chip resolve** — each anchor is matched to a Name (entity) or Topic (tag) as you type; pick under the chip when ambiguous or too broad. AI suggestions (when enabled) are verified on Qloo and labelled **Suggested**. See `docs/ANCHORS.md`.

**Validation** — the submit button stays disabled until the form is valid (at least one anchor; custom type required when type is “other”). Helper copy explains that no customer data is needed.

**Provider badge** — “Demo data” when `TASTE_PROVIDER=mock`, or “Powered by Qloo” when live Qloo is active.

**Persistence** — the last form input is saved to `localStorage` (`venn:input`) and restored on refresh.

---

### 2. Research (the agent run)

After **Find my partners**, the UI switches to a live research screen:

- Headline: “Looking for crowds like yours…” then “Found your overlap.” when the result arrives (with a short settle animation unless reduced motion is on)
- Summary line of type · city · anchors
- **Step timeline** for the seven agent steps (below)
- **Circles loader** — animated coral / blue / plum springs
- **Tool log** — live tool names and short summaries as the runner traces provider calls
- **Cancel** — aborts the run and returns to Setup

**Restore on refresh** — `sessionStorage` keeps `venn:runId`. On boot:

- If the run is still `running`, Research resumes and reconnects to the SSE stream  
- If the run is `done`, Results restores immediately  
- If the run expired (404), the form returns  

**Errors** — friendly message with **Try again** and **Edit my answers**. Qloo-specific failures (API key, rate limit) surface the provider message when useful.

---

### 3. Results

Header shows logo, search summary, **New search**, provider badge, and (on wider screens) Graph / Map / Shortlist. On small screens a bottom tab bar switches those views.

Headline states the strongest partner and partner count, with a tooltip:

> Match scores are relative to this search and describe group-level taste, not individual customers.

Escape closes a brief first, then the partner drawer.

---

## The agent pipeline (seven steps)

The runner always walks these steps. Titles shown in the UI:

| Step | Title | What happens |
| --- | --- | --- |
| resolve | Understanding your customers' taste | Map each anchor to an entity or topic tag |
| plan | Choosing where to look | Choose up to six partner kinds for this business type |
| discover | Searching for candidate partners | Pull candidates per kind (brands, artists, places, …) |
| score | Scoring how well each one fits | Bidirectional affinity, tags, relative match scores |
| enrich | Checking trends and local popularity | Trend / popularity traces without inventing fake certainty |
| adapt | Double-checking coverage | If the shortlist is thin, widen kinds and rescore |
| assemble | Drawing your map | Top picks, headline, notes, limits, city info |

**Live events (SSE)** — `run_started`, `step_started` / `step_completed` / `step_note`, `tool_call` / `tool_result`, `retry`, `result`, `error`, `cancelled`. Heartbeat every 15s. Disconnect does **not** cancel the run; **DELETE** does. Clients can resume with `Last-Event-ID`.

**Caps** — discovery pool trimmed (~22), hard partner cap **28**, expand only adds what fits under the cap.

---

## Taste providers

All taste IO goes through `TasteProvider`. The UI only talks to `/api`.

### Mock (`TASTE_PROVIDER=mock`)

- Labelled **Demo data** everywhere that matters  
- Taxonomy (~52 tags), synonym list, business profiles, catalog (70+ entries), neighbourhoods for London / Manchester / New York  
- Deterministic seeded scoring; no local competitors of the same category as your business  
- Unknown cities: global brands/artists only, no local map  

### Qloo (`TASTE_PROVIDER=qloo`)

- Labelled **Powered by Qloo**  
- Hackathon base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`  
- `/search`, `/v2/tags`, `/v2/insights` (GET query params — not `/recs`)  
- Resolves anchors to real entities or interest tags  
- Discovers partners by kind (`artist`, `brand`, `place`, …)  
- Scores with affinities + reverse insights; stretches scores to 52–96 for the UI  
- City geography from locality/place search; `hasLocalData` only when coordinates exist  
- Heatmap via `urn:heatmap` with place-near-city fallback; returns empty when Qloo has no points  
- Rate-limit retries (429), caching, and lower concurrency so hackathon quotas hold  

Switching providers never mixes labels mid-run: one provider per process.

---

## Partner kinds

Searches plan across kinds such as:

music · retail · fashion · wellness · culture · fitness · venue · food · drink  

(Exact set depends on business type via the profile table.) The graph legend toggles kinds on/off.

---

## Graph view

Literal Venn layout:

- Fixed **coral** circle for your business in the centre  
- Partner circles coloured by kind; **plum** lens where they overlap your business (SVG `clipPath`)  
- Distance and radius encode match strength; centres stay outside the business circle while overlap still grows with score  
- Force layout (~300 ticks) then d3-zoom on a ref (not React state)  

**Controls**

- Zoom in / out / reset  
- **Surprise slider** (Safe fits ↔ Wildcards) — ranks a top set (~14) plus pinned/selected  
- Kind legend filters (kind filter wins over pin for graph visibility; pins still show in Shortlist)  
- Hover dims unrelated nodes and draws related curves  
- Labels for top matches, zoomed view, or hover/selected  
- Keyboard: focusable partner circles, Enter/Space opens the drawer  
- Top picks tray: **Best overall**, **Best local fit**, **Wildcard**  

---

## Map view

- Partner selector (top matches)  
- Leaflet map + CARTO light tiles  
- Two glowing circles per spot (your crowd vs theirs)  
- Numbered ranks 1–3  
- Side list; click flies the map to that neighbourhood  
- Empty state when the city has no local geography, or when heatmap data is missing for that partner  

---

## Shortlist view

- Sort by match, surprise, or name  
- **Your shortlist** section for pinned partners  
- Full partner list with match ring, kind, local/brand, reason line  
- Pin / Unpin  
- Open drawer or brief from a row  
- **Download CSV** of the visible ordered list  

---

## Partner drawer

Opens from graph, top picks, or shortlist:

- Name, kind, local/brand chips  
- Large match ring (relative score)  
- Blurb and “Why this fits” reasons  
- Shared taste tags  
- **Evidence** split into **From the taste data** vs **Venn’s interpretation** (data vs interpretation origins)  
- Related partners as chips  
- **Create partner brief**  
- **Pin to shortlist**  
- **Expand connections** — asks the provider for related partners under the 28 cap  
- Focus trap; mobile bottom sheet chrome; Escape closes  

---

## Collab brief

Template-generated one-pager (three concept variants per partner kind):

- Format / title / concept  
- Why it fits (with evidence lines)  
- First step  
- Two-week plan table  
- What to measure / risks  
- Outreach email (subject + body)  
- Limits footer + “Made with Venn” + provider label  

**Actions**

- Copy as text  
- Copy outreach email  
- Print / Save as PDF (print CSS isolates `#brief-print`)  
- Try another concept (cycles variants 0→1→2)  
- Briefs cached per `partnerId:variant` for the run  

---

## Match scores and evidence (what they mean)

- **Match score** — relative within this search (typically 52–96), not an absolute probability  
- **Signals** — affinity to partner, affinity from partner, tag overlap, local popularity, trend  
- **Surprise** — how unexpected the kind is vs your business category; “surprising” needs high surprise and above-median match  
- **Evidence origins** — `data` when grounded in provider numbers/tags; `interpretation` when Venn wrote the sentence  

---

## Accessibility and polish

- Light editorial theme (paper, coral, blue, plum); Fraunces + Geist + Geist Mono  
- Focus-visible styles; keyboard graph nodes and dialogs  
- `prefers-reduced-motion` short-circuits settle / entry animations  
- Skeletons while briefs / heatmaps load  
- Toasts for pin, expand, copy, errors  
- Responsive layouts with mobile bottom tabs for results views  
- Favicon + Open Graph image (`public/og.png`)  

---

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | ok, provider, demo flag, version |
| GET | `/api/meta` | business types, demo cities, examples |
| POST | `/api/runs` | start a search (rate-limited per minute) |
| GET | `/api/runs/:id/events` | SSE agent stream + replay |
| GET | `/api/runs/:id` | status, result, or error |
| DELETE | `/api/runs/:id` | cancel |
| POST | `/api/runs/:id/expand` | add related partners |
| GET | `/api/runs/:id/heatmap?partnerId=` | neighbourhood heatmap (204 if none) |
| POST | `/api/runs/:id/brief` | template brief for a partner + variant |

Runs live in memory (~60 minute TTL, max ~300). Production serves the Vite client from the same process. Helmet CSP is off so map tiles load.

---

## Configuration (high level)

| Variable | Role |
| --- | --- |
| `TASTE_PROVIDER` | `mock` or `qloo` |
| `QLOO_API_KEY` / `QLOO_BASE_URL` | Required for Qloo (hackathon URL by default) |
| `MOCK_LATENCY` | `normal` / `fast` / `off` (demo pacing) |
| `PORT` / `HOST` | Bind address |
| `RATE_LIMIT_*` | Global and per-run limits |
| `TRUST_PROXY` | Behind a reverse proxy |

Never send the API key to the browser. `.env` is gitignored; ship `.env.example` only.

---

## What Venn deliberately does not do

- No chat box or free-form agent conversation in the UI  
- No personal customer data, CRM uploads, or individual profiling  
- No claim that scores are absolute or predictive of a person  
- No mid-run silent fallback between mock and Qloo (labels stay honest)  
- Briefs are templates, not sent emails — you review before outreach  

---

## Typical flows you can run today

1. Click the London café example → watch the seven steps → explore the graph → open Aesop → write a brief → cycle concepts → copy outreach.  
2. Switch to Map (when geography exists) → pick a partner → fly to ranked neighbourhoods.  
3. Shortlist → pin partners → download CSV.  
4. Expand connections from a drawer until the 28-partner cap.  
5. Cancel mid-research; or refresh mid-run and resume; or refresh after completion and land on Results.  
6. Try Manchester / New York examples, or an unknown city and see global-only / no-map behaviour.  
7. Run with `TASTE_PROVIDER=qloo` for live Insights, or `mock` for offline demo data.

---

## Related docs

- [README.md](../README.md) — setup, scripts, decisions  
- [QLOO_INTEGRATION.md](./QLOO_INTEGRATION.md) — provider ↔ endpoint map and rules  

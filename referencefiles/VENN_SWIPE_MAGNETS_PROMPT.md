# Cursor: add "Swipe to build your crowd" (Setup) and "Taste magnets" (Overview orbit)

Two features, built in this order. Do not start a later step until the earlier one passes its checks.

1. **Step 0:** a Qloo probe for the swipe cards (decides where the cards come from).
2. **Part A:** Swipe to build your crowd (Setup screen, new server endpoints, shared schemas).
3. **Part B:** Taste magnets (Overview orbit, a second kind of focus that every chart understands).
4. **Part C:** docs, tests, hand-off.

Everything described here has a rendered, working reference. **Match the references. Do not reinterpret them.** They use sample data only.

## 0. Put the references in the repo first

Copy these files from the hand-off into `docs/reference/` and open them in a browser before writing code.

| File | What it is |
|---|---|
| `venn-swipe-reference.html` | Clickable Setup screen with the swipe deck. Try `?notes=1` for numbered callouts, `?mode=swiping&yes=2`, `?mode=done&yes=4`, `?mode=nocards`, `?mode=loading`, `?typed=1`, `?static=1`. Resize to 390px to see the bottom sheet. |
| `venn-swipe-motion.mp4` | The swipe flow in motion: drag, keys, undo, refill, "That is enough", remove a chip, type one. |
| `venn-swipe-annotated-desktop.png`, `venn-swipe-mobile.png` | Stills with numbered callouts (the same 11 numbers used in section A9). |
| `venn-dashboard-magnets-reference.html` | The **whole Overview dashboard reference plus the magnets**. It replaces `venn-dashboard-reference.html`. URL options: `?taste=vinyl` (pinned), `?pull=vinyl&static=1` (held), `?strength=0` (Qloo without percentages), `?static=1`. |
| `venn-magnets-motion.mp4` | Press a taste, drag a taste in and let go, click a taste in the flow, keyboard, Escape. |
| `venn-magnets-states.png` | Four orbit states side by side. |

**If the Overview has not yet been rebuilt to match the dashboard reference** (see `VENN_DASHBOARD_PORT_PROMPT.md`), do that rebuild first using `venn-dashboard-magnets-reference.html` as the reference. Part B depends on it.

## 1. Rules that apply to everything below

- Keys (`QLOO_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) stay server-side. Never print, log, commit, put in fixtures, or send to the browser. Never paste a key into chat or a doc.
- No personal data goes to Qloo or any LLM. Swipes are tastes (a brand, an artist, a place, a topic), never facts about a person. Nothing about customers is ever sent.
- Honesty: say what Qloo supplied and what Venn added. Never present a Venn estimate as Qloo data. No invented percentages. Overlap is relative to the query, not a count of people.
- No chat box anywhere. These features are the opposite of a chatbot.
- Every new interactive view has a table or list twin, is fully keyboard-operable, announces changes in a live region, and respects `prefers-reduced-motion` (and `?static=1` where the reference has it).
- Style: tokens page `#FFFFFF`, surface `#F4F5F7`, ink `#14151A`, muted `#596070`, soft `#8A91A0`, line `#E3E6EB`, line-strong `#C4C9D2`. Coral `#FF6B57` = you / your crowd (marks only, never coloured text). Blue `#4F5BFF` = partners (all partners the same blue). Plum `#6B3FA0` = shared taste only. Tints coral `#FFE8E3`, blue `#E7E9FF`, plum `#EDE5F7`. One font (Bricolage Grotesque). No uppercase or letter-spaced labels. No emoji. No gradients except the skeleton shimmer. No new colours.
- Do not add dependencies unless the section says so. Framer Motion, Zustand, Zod, Fastify and the existing test runner are already in the repo.
- Do not change: the run request contract, scoring, the runner, the provider selection (`TASTE_PROVIDER`), rate limits, or any existing screen not named here.

## 2. Read the repo before you change it

Find and read these, then write a short "what I found" note at the top of your first PR (file names, not code):

- Setup screen component and its store (`venn:input` localStorage key), the anchor chip component, the typed-input component, the "Example: what you get" carousel, the "Check your anchors" resolver UI.
- `POST /api/anchors/resolve` route and service, `server/providers/qloo/taxonomy.ts`, `docs/ANCHORS.md`, `docs/SCORING.md`.
- `shared/schemas.ts` (`TasteAnchor`, run request schema, business type enum with its 13 values).
- Qloo client (`/search`, `/v2/tags`, `/v2/insights`), its retry, circuit breaker, 4 rps / 3 in flight limiter, cache, monthly quota floor (500), the call log used by "How Venn used Qloo".
- Provider interface and the three providers: `qloo`, `snapshot`, `mock`.
- Overview components: orbit, `ChartCard`, `OverviewTip`, `useReveal`, the filter row, the Sankey, the picks list, the selected-partner card, the scatter, the map, the tables, the global `hl-on` hover logic, `OVERVIEW_MAX`. Stylesheets `src/index.css`, `src/overview.css` (`ov-*`), `src/results-pages.css`.
- Where the Sankey gets its middle-column "shared taste themes" from (`feature.explainability` tags). Part B reuses exactly this data.

---

# STEP 0. Qloo probe for swipe cards

Goal: decide where the cards come from, with measured evidence. Extend `npm run qloo:probe` with a `cards` subcommand, run it against the live API with the real key (server side only), and write the result to `docs/CARDS_PROBE.md`. Keep the call count small (under 40 calls in total) because the monthly quota is limited.

Test these three strategies and record, for each, the calls used, the latency, 3 sample results, and a verdict.

**Strategy L (local popularity).** `GET /v2/insights` with `filter.type` set to each of `urn:entity:brand`, `urn:entity:artist`, `urn:entity:place`, and `signal.location.query` set to a city (use Manchester and London), `take` 12. Questions to answer:
1. Does the location signal change the results? Run the same type for two cities and compare the top 10 ids. If they are identical, the location is being ignored and Strategy L is **not** allowed to claim "popular near {city}".
2. Are the names recognisable and suitable for a small business audience (no adult or odd results)? Record anything that needs filtering.
3. Does a topic equivalent exist (tags)? Try `GET /v2/tags` with a few seed phrases per business type and record whether the returned tag ids are usable as `signal.interests.tags`.

**Strategy S (seeded, verified).** Hand-written seed names per business type (section A3.4). Resolve each through `GET /search` once, keep the exact entity id and type, and store them in `server/anchors/seed-ids.json` with a script `npm run cards:seed`. Record how many seeds resolve cleanly (target 90 percent or more) and how many are ambiguous.

**Strategy R (refill).** `GET /v2/insights` with `signal.interests.entities` set to 1 to 3 seed ids and `filter.type` for each kind. Record whether the results feel related and whether the same entities as the seed deck come back.

**Decision rule, written into `docs/CARDS_PROBE.md`:**
- If L is location-sensitive and clean: initial deck = L for brands, artists and places, plus S for topics. Provenance for L cards is "Popular near {city}".
- Otherwise: initial deck = S for everything, and places come from S only for the supported demo cities. Provenance is "Suggested for {business types}, checked on Qloo".
- Refill = R if it is useful, otherwise a second slice of S.
- If any strategy returns nothing usable, say so plainly in the doc. The product still works with S alone.

Stop after Step 0 and show me the doc before building Part A. (If you cannot reach the API, build Part A with Strategy S only and flag it.)

---

# PART A. Swipe to build your crowd

## A1. What the user sees (read this against the reference)

Setup keeps its sentence form (business type, optional name, city). Only the **"My customers love…"** section changes.

1. Under the heading there are two paths: a primary dark button **Swipe your crowd**, and a quiet underlined link **or type them**. The input from today is hidden until "or type them" is pressed (or until the person already has typed anchors, e.g. restored from `venn:input`).
2. Pressing **Swipe your crowd**:
   - **Laptop (width above 980px):** the pinned right-column "Example: what you get" card turns into the swipe deck in place (same sticky position, 470px wide column, same card chrome). When the person finishes or presses Done, the Example card comes back.
   - **Phone/tablet (980px and below):** the same panel becomes a full-width bottom sheet (height `min(94dvh, 800px)`, top radius 28px, drag handle, dimmed backdrop, page scroll locked, backdrop click or Done closes).
3. The deck is a stack of three cards (top card interactive). The question above it is "Would your {business type} customers love this?". The person swipes right (Yes) or left (Not really), or uses the buttons or keys.
4. Every **Yes** becomes a taste chip on the left, immediately, with a small "fly" animation from the card to the chip. The chip is a confirmed anchor with an exact Qloo id (no resolver step, no "Checking" state). Chips are removable. The counter reads "2 of 6". Maximum 6.
5. After the **third Yes** the deck refills once with up to 3 cards chosen from the person's Yeses ("Because you said yes to X"), and a small toast says "Deck updated from your picks". A "That is enough" link appears (after 3 Yeses). At 6 Yeses the deck finishes by itself.
6. When the deck finishes (6 Yeses, "That is enough", or the cards run out) the panel shows a summary ("That is your crowd.", the list, **Find my partners** and **Swipe more** if fewer than 6).
7. **Find my partners** on the left is enabled as soon as there is at least one chip. It sends exactly the same request as today.
8. Typing is always available and the existing resolver (statuses entity, topic, ambiguous, too_broad, unresolved; 0.6 similarity floor; Names vs Topics; AI suggestions verified on Qloo) is unchanged. Typed and swiped chips live in the same list and share the 6 cap.

What stays exactly as today: the sentence form, the 13 business types, city, "Fine-tune", example chips, provider badge, About dialog, `venn:input` persistence, the Research and Results screens, and the request sent when the run starts.

## A2. Shared types and schemas (`shared/schemas.ts`)

Add these. Keep `TasteAnchor` backwards compatible (the new field is optional).

```ts
export const CardKind = z.enum(['brand', 'artist', 'place', 'topic']);
export type CardKind = z.infer<typeof CardKind>;

// Where a card came from. The server sets this. The UI turns it into the provenance line.
export const CardProvenance = z.enum([
  'qloo_local',   // live Qloo, location verified to change results
  'qloo_seed',    // seeded name, id resolved on Qloo ahead of time
  'qloo_refill',  // live Qloo, signalled by the person's Yeses
  'snapshot',     // recorded from Qloo (snapshot provider)
  'sample',       // mock provider, NOT from Qloo
]);

export const SwipeCard = z.object({
  id: z.string().min(1).max(80),            // stable per (entity or tag id), safe for React keys
  name: z.string().min(1).max(48),
  kind: CardKind,
  provenance: CardProvenance,
  because: z.string().max(48).optional(),   // refill only: the name of the Yes that caused it
  anchor: z.object({                        // exactly what becomes a chip if the person says Yes
    kind: z.enum(['entity', 'tag']),
    id: z.string().min(1).max(120),         // Qloo entity id or tag id (mock: "mock:<slug>")
    type: z.string().max(80),               // e.g. urn:entity:brand, or "tag"
  }),
});
export type SwipeCard = z.infer<typeof SwipeCard>;

export const CardsRequest = z.object({
  businessType: BusinessType,               // the existing 13-value enum
  city: z.string().trim().min(2).max(80),
});
export const CardsResponse = z.object({
  status: z.enum(['ok', 'unsupported_city', 'unavailable']),
  cards: z.array(SwipeCard).max(20),        // empty unless status is ok
  note: z.string().max(160).optional(),     // short plain-language reason for non-ok
});

export const RefillRequest = z.object({
  businessType: BusinessType,
  city: z.string().trim().min(2).max(80),
  likedIds: z.array(z.string().min(1).max(120)).min(1).max(6),   // anchor ids of the Yeses
  excludeIds: z.array(z.string().min(1).max(120)).max(40),       // card ids already shown
});
export const RefillResponse = z.object({
  status: z.enum(['ok', 'unavailable']),
  cards: z.array(SwipeCard).max(6),
});

// Backwards-compatible addition to the existing TasteAnchor:
//   via: z.enum(['swipe', 'typed', 'ai']).optional()
// Swiped anchors use origin 'user' (the person chose them) and via 'swipe'.
// The run request is unchanged: kind 'entity' goes to signal.interests.entities, kind 'tag' to signal.interests.tags.
```

Validate every request and response with these schemas on both sides. Reject anything that fails with a 400 and a short plain-language message.

## A3. Server

### A3.1 Endpoints

- `POST /api/anchors/cards` → `CardsResponse`. Body `CardsRequest`.
- `POST /api/anchors/cards/refill` → `RefillResponse`. Body `RefillRequest`.

Both sit under the same rate limiter as `POST /api/anchors/resolve` (do not create a new bypass). Neither writes anything to the database. Neither logs the body (city and business type are fine to log as aggregate counts, nothing else).

### A3.2 Provider interface

Add to the provider interface (all three providers implement it):

```ts
getSwipeCards(req: CardsRequest): Promise<CardsResponse>;
getRefillCards(req: RefillRequest): Promise<RefillResponse>;
```

- **`qloo` provider:** implements the strategy chosen in Step 0. Uses the existing Qloo client, so retries, the circuit breaker, the limiter, the monthly floor and the call log all apply. Call budget per swipe session: at most 4 live calls for the initial deck (in parallel) and at most 2 for one refill. If the monthly floor is reached or the breaker is open, fall back to seeds only (no live calls) and return `status: 'ok'` with `provenance: 'qloo_seed'`; refill returns `status: 'unavailable'`.
- **`snapshot` provider:** serves recorded decks for the three example (business type, city) pairs, with `provenance: 'snapshot'`. For any other pair, `status: 'unsupported_city'`. Refill serves a recorded set keyed by the first liked id, otherwise `unavailable`.
- **`mock` provider:** deterministic offline decks from the seed lists with synthetic ids `mock:<slug>` and `provenance: 'sample'`. Mock supports every city but the UI must say these are sample cards (A5 copy). Refill returns 3 sample cards keyed by the liked name.

### A3.3 Deck rules (apply to every provider, in one shared function `buildDeck()`)

- Target size 14, minimum 8. If fewer than 8 survive filtering, top up from seeds; if still fewer than 8, return `unavailable`.
- Kind mix target: 5 brands, 4 artists, 3 places, 2 topics. If places are missing (unsupported city) use extra brands and topics, never fabricate a place.
- Order: never two cards of the same kind in a row, and the first three cards are three different kinds.
- Filter: trim names, drop names over 48 characters, drop duplicates (case-insensitive), drop any name that is on a small blocklist file `server/anchors/blocklist.txt` (start it with adult and obviously unsuitable terms; make it easy to extend), drop names that equal the business type itself.
- Never include images or image URLs. Cards are typographic.
- Cards for the same (businessType, city) are cached for 24 hours (existing cache layer). Refill results are cached for 24 hours keyed by the sorted `likedIds`. Cache negative results for 10 minutes.
- Refill returns at most 6 cards, excludes `excludeIds`, and sets `because` to the name of the first liked card.

### A3.4 Seeds (`server/anchors/seeds.ts`)

For each of the 13 business types write seeds that a customer of that business could plausibly love: 8 brands, 6 artists, 4 topics. Use widely known names only. No living private individuals. No political or adult topics. Add the Manchester, London and Bristol places used in the reference as a small `PLACES` map for the demo cities; places elsewhere come from live Qloo only (Strategy L) or are omitted.

`npm run cards:seed` resolves seeds to exact Qloo ids through `GET /search` (brands and artists) and `GET /v2/tags` (topics), writes `server/anchors/seed-ids.json`, and prints how many resolved and how many were ambiguous. Seeds that do not resolve cleanly are dropped from the file, not guessed. The generated JSON is committed (it contains public ids, no secrets).

### A3.5 Provenance is chosen by the server, never the client

The client renders the provenance line from `card.provenance` and must not claim more than it says (A5 copy). A `sample` card must never say "Qloo".

## A4. Client state

Add a small Zustand slice (or extend the Setup store if it already holds anchors). Keep it separate from the run store.

```ts
type SwipeMode = 'idle' | 'loading' | 'swiping' | 'done' | 'nocards';

interface SwipeState {
  mode: SwipeMode;
  queue: SwipeCard[];                 // cards not yet swiped, top first
  history: { card: SwipeCard; dir: 1 | -1; refilled?: boolean }[];  // for Undo
  refilled: boolean;                  // refill happens at most once per session
  busy: boolean;                      // true while a card is flying away
  // anchors live in the existing Setup store, so typed and swiped chips share one list and one cap
  open(): Promise<void>;              // fetch cards, set loading then swiping, or nocards
  decide(dir: 1 | -1): void;          // Yes or Not really on the top card
  undo(): void;
  finish(): void;                     // to 'done'
  close(): void;                      // to 'idle' (keeps anchors)
}
```

Rules:
- Max anchors is 6 across typed and swiped. `decide(1)` at 6 is refused with the toast "That is 6 already. Remove one first." and the card stays.
- Cards already chosen as chips are removed from the queue when the deck opens (match by `anchor.id`).
- `decide(1)`: add the anchor to the Setup store with `origin: 'user'`, `via: 'swipe'`, `name`, `kind`, `id`, `type`, and a status that the chip renders as verified. Do not call the resolver.
- When the number of swiped Yeses reaches 3 and `refilled` is false: call the refill endpoint with `likedIds` (all current anchors that came from a swipe), `excludeIds` (every card id shown so far), put the first 3 returned cards at the front of the queue (after the card currently on top), set `refilled = true`, show the toast. If refill fails, do nothing visible (no error toast) and continue with the remaining cards.
- `undo()`: only in `swiping`. Reinsert the last card at the top. If it was a Yes, remove that chip. If that Yes triggered the refill, remove the refill cards and set `refilled = false` again.
- When the queue empties before 6 Yeses, go to `done` with the title "That is all the cards for now." (A5).
- Fetch timeout 8 seconds. On timeout, network error or `unavailable`: `mode = 'nocards'` with the generic copy. `unsupported_city`: `mode = 'nocards'` with the city copy.
- The deck is never persisted. Only the anchors persist (inside `venn:input`, as today). On restore, chips that came from swipes look the same as before (use `via`).
- Pressing the business type or city select while a deck is open closes the deck (the cards no longer match).

## A5. Exact copy (use these strings)

- Section heading: `My customers love…` (counter on the right: `0 of 6`, `2 of 6`).
- Buttons: `Swipe your crowd` (becomes `Swipe more` once there are chips; disabled with 45 percent opacity at 6), link `or type them`.
- Chip hint: `Pick 3 or more for the best matches. Up to 6.` At 6: `That is the maximum. Remove one to add another.` Empty list: `Your picks will appear here.`
- Find hint: `Add at least one taste to start.` / `You can go now. 3 or more works best.` / `Ready.`
- Deck title `Swipe your crowd`, button `Done`. Question: `Would your {coffee shop} customers love this?` (use the singular business type in lower case).
- Card buttons: `Not really`, `Undo`, `Yes, they love it`. Stamps: `Not really`, `Yes`. Key hints: `← not really   → yes   Z undo` (hide on touch screens and below 560px).
- Progress: six bars, then `2 of 6`. Link `That is enough` (visible from 3 Yeses to 5).
- Provenance lines (small, under the name), by `card.provenance`:
  - `qloo_local`: `Popular near {city}` · **From Qloo**
  - `qloo_seed`: `Suggested for {coffee shops}` · **Checked on Qloo**
  - `qloo_refill`: `Because you said yes to` **{because}**
  - `snapshot`: `Recorded example` · **From Qloo**
  - `sample`: `Sample card` · **Not from Qloo**
- Honesty line at the bottom of the deck: **`Cards come from Qloo, a taste database.`** `Only the tastes you keep are used. Nothing about your customers is sent.` When the provider is `mock`, replace the bold part with **`These are sample cards.`** and keep the rest.
- Toasts: `Deck updated from your picks`, `That is 6 already. Remove one first.`
- Done: title `That is your crowd.` (at 6: `That is a full crowd.`), sub `{n} taste(s). Venn will look for businesses whose customers love the same things.`, buttons `Find my partners` and `Swipe more`. Exhausted: title `That is all the cards for now.`, sub `You kept {n}. You can type more, or go with these.` (or `You did not pick any. You can type what your customers love instead.`).
- Fallbacks: `No swipe cards for {city} yet.` / `Cards are not available for {city} right now. You can still type what your customers love.`, buttons `Type your crowd` (opens the typed input and focuses it) and `Close`. Generic failure uses the same layout with `Swipe cards are not available right now.`
- Live region announcements (polite): `Added {name}. {n} of 6.` · `Skipped {name}.` · `Undid {name}.` · `Your crowd has {n} tastes.`

## A6. Components and gestures

New components (names are suggestions, match the repo's folder style): `SwipePanel` (decides idle / deck / done / nocards, and desktop panel vs mobile sheet), `SwipeDeck` (stage, stack, buttons, progress, toast), `SwipeCardView`, `SwipeProgress`, `CrowdSection` (heading, paths, typed area, chips, hints), `useSwipeGesture`.

**Card (`SwipeCardView`):** 366px tall, radius 26px, white, 1.5px line border, soft shadow, padding 22px 24px.
- Top left: kind pill (icon + `Brand`/`Artist`/`Place`/`Topic`), surface background, 30px tall. Icons are the four line icons in the reference (tag, note, pin, hash), 15px, stroke 1.9.
- Name: bottom-aligned, weight 700, letter-spacing -0.045em, line-height 0.98, `text-wrap: balance`. Size by name length: up to 7 characters 4.3rem, up to 12 characters 3.4rem, up to 18 characters 2.7rem, longer 2.2rem. At 560px and below: 3.5rem, 2.9rem, 2.4rem, 2.0rem.
- Provenance line under the name, 0.88rem, muted, ink for the bold part, a 4px dot separator.
- Decoration: two outline circles (stroke `line`, 2px) as a watermark at the top right, partly clipped by the card edge. Their offsets and radii come from a hash of the name (see `watermark()` in the reference), so a card always looks the same. They are decoration only (`aria-hidden`).
- Stamps: `Yes` top right (coral 2.5px border, coral tint fill, ink text, rotated 7deg) and `Not really` top left (line-strong border, surface fill, ink text, rotated -7deg). Opacity follows the drag.

**Stack:** show the top three cards. Card `i` is placed at `translateY(i * 15px) scale(1 - i * 0.055)` and cards beyond the third are invisible. Stage height 392px (on phones `min(392px, 52dvh)`, card `min(366px, 48dvh)`). New cards enter with a 0.5s rise (`translateY(40px) scale(.9)` to rest).

**Gesture (`useSwipeGesture`):** pointer events with pointer capture, `touch-action: none` on the top card, `touch-action: pan-y` on the stage. While dragging: `transform: translate(x, y * 0.35) rotate(x / 16 deg)`, transitions off. Stamp opacity = `min(1, |x| / 110)` (Yes on the right, Not really on the left). The card behind scales from 0.945 to 1 over the first 160px of drag and rises to the front position. On release: commit if `|x| > 110`, or if velocity above 0.6 px/ms and `|x| > 40`. Otherwise spring back (0.38s `cubic-bezier(.3,.8,.3,1)`) and clear the stamps. Commit animation: the card flies to `±(stageWidth + 320)px` with rotation ±22deg over 0.42s `cubic-bezier(.3,.7,.3,1)`, then is removed. Block new gestures while `busy`.

**Fly to chip:** on Yes, a pill clone (surface background, coral dot, name) starts at the card centre at scale 1.5 with opacity 0, rises 26px at 22 percent of the animation (scale 1.25, opacity 1), then lands on the real chip's rectangle at scale 1 over 720ms `cubic-bezier(.45,.05,.2,1)`. The real chip stays hidden until the clone lands, then pops in (0.3s, scale .9 to 1). If the chip is not visible in the viewport (phone sheet, or scrolled away), fly 120px up and fade out over 520ms instead, and show the chip straight away. With reduced motion: no fly, no card flight (cards change instantly), chip appears at once.

**Progress:** six 22px by 6px bars with 7px gaps; the first N are coral and the newest bar briefly scales up (1.7 on Y) for 0.3s. Text `N of 6` on the right of the bars, then `That is enough` pushed to the far right (hidden until 3 Yeses).

**Buttons:** three round buttons, 64px (Not really: white, 1.5px line-strong border; Yes: ink with white check; Undo: 48px surface). Labels under them, 0.88rem, semibold. `Undo` is disabled when there is no history. All have `aria-label`s that include the key.

**Keyboard (only while mode is swiping and focus is not in an input or select):** `ArrowRight` Yes, `ArrowLeft` Not really, `Z` or `Backspace` Undo, `Escape` closes. The stage is `tabindex=0`, `role="group"`, `aria-roledescription="stack of cards"`, with an aria-label that says which keys to press. Focus moves to the stage when the deck opens (skip when reduced motion or static), and returns to the Swipe button when it closes. Only the top card is exposed to assistive tech (`aria-hidden` on the rest) and it is labelled `{name}, {Kind}`.

**Mobile sheet:** same component, `position: fixed` bottom sheet at 980px and below, with the 0.45s slide-up (`translateY(100%)` to 0), 44px by 5px drag handle, backdrop rgba(20,21,26,.42) fading in, body scroll locked while open, focus trapped inside the sheet, Escape and backdrop click close it. Do not make the handle draggable in v1.

## A7. Layout

- Grid at 981px and above: `minmax(0, 1fr) 470px`, gap 64px, container max 1240px with 40px side padding (note: Setup's current grid must keep the same left column width rules). Right panel is `position: sticky; top: 92px`, white, 1px line border, radius 28px, padding 26px 26px 22px, min-height 640px, flex column.
- At 980px and below: single column, 16px side padding, the idle Example card sits below the form, the deck becomes the bottom sheet.
- The sentence form wraps naturally ("It is called [optional]" may drop to a second line). Do not restyle it.
- Chips: 44px tall pills, surface background, a 9px coral dot, a 15px kind glyph, the name, and a 32px round remove button with a visible focus ring. Chips animate in (scale .9 and 4px rise, 0.3s).

## A8. Edge cases to handle

- City not supported or no cards: `nocards` panel (A5).
- Slow network: skeleton cards (three surface-coloured placeholder cards with a shimmer) for up to 8 seconds, controls dimmed and disabled, then `nocards`.
- Back-to-back opens: opening again after Done or "Swipe more" refetches only if the business type or city changed; otherwise reuse the cached queue minus chips already chosen.
- The person changes the business type or city: close the deck, drop the queue, keep chips.
- Removing a chip while the deck is open frees a slot immediately.
- Duplicate: a typed anchor and a card with the same Qloo id must not both become chips (second one is ignored, deck skips that card).
- `prefers-reduced-motion`: no tilt, no flight, no fly-to-chip, cards swap with a short fade, toast without slide.
- The mock provider must run the whole flow offline.

## A9. What changes, numbered (matches the callouts in `venn-swipe-annotated-desktop.png`)

1. Two paths under "My customers love…": primary Swipe your crowd, quiet "or type them".
2. Chips fill themselves from Yeses: confirmed anchors, removable, counter, cap 6.
3. The right panel changes with the step: Example card, deck, summary, fallback. On phones it is a bottom sheet.
4. Cards are big type with no images, a kind pill, and a hash-seeded circle watermark.
5. A real deck: three cards visible, drag tilts the card and shows a stamp, release past 110px or a quick flick commits.
6. Buttons and keys do the same as the gesture (accessibility requirement).
7. Progress bars, "That is enough" from 3 Yeses, automatic finish at 6.
8. Provenance on every card, chosen by the server.
9. Typing is always available; if cards cannot load, the panel says so and moves the cursor to the typed input.
10. Honesty line under the deck.
11. Find my partners is enabled from one chip, same request as today.

## A10. Tests for Part A

Use the repo's existing runners (look at `package.json`). Add:

- **Schemas:** valid and invalid `CardsRequest/Response`, `RefillRequest/Response`; `TasteAnchor.via` optional.
- **`buildDeck()`:** size 14 and minimum 8; no two adjacent same kinds; first three different kinds; dedupe; blocklist; names over 48 dropped; places omitted for unsupported cities; seeds top-up.
- **Providers:** mock returns `sample` provenance and never claims Qloo; snapshot returns `unsupported_city` for other pairs; qloo (with a fake HTTP layer) respects the call budget (4 initial, 2 refill), falls back to seeds when the quota floor is hit or the breaker is open, and never calls Qloo twice for the same cached deck.
- **Routes:** validation errors return 400; rate limiter applies; neither route logs the body.
- **Store:** cap at 6 across typed and swiped; Yes adds a verified anchor with the exact id; refill once at 3 and not again; Undo reverses a Yes and a refill; duplicate ids are ignored; closing keeps anchors; changing city closes.
- **Component (Testing Library):** keyboard flow (right, left, Z, Escape), buttons, `That is enough` visibility, done and exhausted states, nocards fallback focus moves to the typed input, live region strings, reduced motion path.
- **Accessibility:** run axe on idle, swiping, done and nocards states; no violations.
- **E2E (Playwright if the repo has it, otherwise a smoke script):** mock provider, 390px and 1440px: open deck, three Yeses via keyboard, one Undo, "That is enough", Find my partners starts a run with the same request body shape as a typed run (assert the anchors array).

## A11. Done when (Part A)

- The Setup screen at 1440px and 390px matches the reference states: idle, loading, swiping with 2 Yeses, done, nocards, typed-open.
- Drag, buttons, keys, Undo, refill, cap, summary and fallback all behave as above, with no console errors.
- A swiped run and a typed run send the same request shape. The run, Research and Results screens are unchanged.
- `docs/CARDS_PROBE.md` exists with measured results and the decision.
- With `TASTE_PROVIDER=mock` and with `snapshot` the flow works offline and never says "Qloo" on a sample card.
- Screenshots attached: 1440px idle, swiping, done; 390px sheet swiping, done; nocards.

---

# PART B. Taste magnets

## B1. What it is

The Overview gets a second kind of focus: **a taste**, next to the one selected **partner**. A taste is one of the shared taste themes that already form the middle column of the flow ("Vinyl and live music", "Slow mornings"…). The person can:

- **Press** a taste in a tray under the orbit (or press it in the flow): it lights up in every chart. Partners that share it get a plum ring, everyone else dims, and a plum chip `Taste: …` appears in the filter row. For about two seconds the partners that share it are also pulled toward a magnet and spring back (a demo of what the drag does).
- **Drag** a taste onto the orbit: partners that share it are pulled toward the magnet, **stronger link = closer**. Thin plum leader lines show the pull. Let go and they spring back to their honest overlap positions. While held, the note under the chart says positions are not overlap.
- **Clear** it with the chip's ×, by pressing the same taste again, or with Escape.

The honest default (distance from "you" = overlap) is never changed. The pull is a temporary, labelled view.

## B2. Data: one selector for tastes (`tastes.ts`)

The Sankey already derives themes and per-partner weights from `feature.explainability` tags. Pull that into one shared selector so the tray, tooltips, tables, orbit, scatter, map and flow all use the same numbers.

```ts
export interface Taste {
  id: string;                       // theme id (same ids the flow uses)
  name: string;                     // sentence-case display name
  weights: Record<string, number>;  // partnerId -> share of that partner's match that flows through this taste, 0..1
  hasStrength: boolean;             // false when the provider gave tags without percentages
}

// vis = partners currently visible after the filter row (kind chips, slider, Realistic switch)
export function selectTastes(vis: Partner[], themes: ThemeData): Taste[];
export const membersOf = (t: Taste, vis: Partner[]) => vis.filter(p => (t.weights[p.id] ?? 0) > 0);
```

Rules:
- Tray list = tastes with at least 2 members in `vis`, sorted by total flow (sum over members of `partner.score * weight`), top 6.
- `hasStrength` is true only on the live `qloo` provider where tag affinities exist (0 to 1). On `snapshot` and `mock` the weights are membership only (`hasStrength = false`): every member counts as 1 and **no percentage is ever displayed**.
- Weights are normalised per taste for the pull (divide by the max weight among members) but displayed as the real weight.
- Recompute when the filters change. If the focused taste has no members after a filter change, clear the focus.

## B3. State

Extend the Overview store (same store that holds the selected partner and hover):

```ts
interface OverviewFocus {
  selectedPartnerId: string;        // unchanged: one partner is always selected
  hoverPartnerId: string | null;    // unchanged
  tasteId: string | null;           // NEW: pinned taste focus
}
```

Precedence for highlighting, from strongest to weakest: **hover partner > pinned taste > nothing**. Hovering a partner while a taste is pinned lights that partner fully (even if it does not share the taste) and dims the rest; leaving the partner returns to the taste view. Selecting a partner (click) does not clear the taste.
Optional deep link: `?taste=<id>` sets the pinned taste on load (useful for judges and screenshots). Do not add `?pull=` to production.

Actions: `toggleTaste(id)`, `setTaste(id | null)`. Both announce to the live region: `{taste name}. {n} partners share it, strongest is {name}.` (drop the strongest part when `hasStrength` is false) and `Taste focus cleared.`

## B4. What every panel does when a taste is focused

Mark a partner "a member" when its weight for the focused taste is above 0. Everything below uses the shared `.tm` / `tm-on` idea from the reference (a body class when a taste is pinned and a class on each member element), or the React equivalent.

1. **Orbit:** members get a 3px plum ring around the dot (the `pring` circle, radius = dot radius + 3.5). Non-members dim to 16 percent opacity, and their labels are hidden. The legend gains `Shares the taste you picked` with a plum-ringed dot. Title and subtitle become sentences from the data: `{Taste} runs through {m} of your {n} partners, strongest at {name}` (drop the strongest part without strengths) and `Partners outlined in plum share this taste, the rest are dimmed. Drag the magnet over the orbit to pull the plum ones in.` If there are no members: `No partner in this view shares {taste}` / `Clear the taste or change the filters to see more.`
2. **Tray (new, under the orbit's legend):** heading `Pull a taste` with muted hint `Drag one onto the orbit, or press it to light it up in every chart.` Then up to 6 magnet pills (see B6).
3. **Picks ("Start with these three"):** non-member rows dim their content to 38 percent (do not move or hide them).
4. **Selected partner card:** if one of its top three themes is the focused taste, that row's label turns plum and bold.
5. **Scatter and map:** non-member dots and pins dim to 16 percent, members stay full strength. Brand chips under the map dim to 40 percent when not members.
6. **Flow (Sankey):** the focused taste node and everything it connects to stay full, the rest fade (reuse the existing node highlight with key `t:<id>`). Hover on a partner still wins while hovering. The theme nodes are also clickable and keyboard-activatable (Enter or Space) to toggle the taste. They get a pointer cursor.
7. **Venn bars:** unchanged.
8. **Filter row:** a plum chip `Taste: {name}` with a round × (aria-label `Clear the taste focus`), shown only when a taste is pinned.
9. **Tooltips:** on a member partner add a line `{Taste}: {weight}% of their match` (with strengths) or `{Taste}: they share it` (without).
10. **Table twins:** the orbit table gains a final column `In {taste, lower case}` showing `{weight}% of match` / `Shares it` / `No`. Other tables are unchanged. The tray itself is real buttons, so it is its own accessible list.
11. **Headline and hero:** unchanged.

## B5. The pull (exact behaviour, port from the reference)

Implement in plain SVG exactly like the reference (`applyPull`, `releasePull`, `demoPull`, `bindMagnet` in `venn-dashboard-magnets-reference.html`). Do **not** add a physics library; the algorithm is deterministic and tiny.

**Coordinates.** Convert the pointer to SVG coordinates with `getScreenCTM().inverse()`. Orbit centre `OC = (350, 290)`, radius 175 in the default viewBox; on phones the viewBox is cropped to the circle plus a 58px margin.

**While the magnet is held at point `m`:**
1. Clamp `m` into the viewBox with a 30px margin to get `c`. `inside = clamp(1 - distance(m, c) / 90, 0, 1)`. If the pointer is outside the chart the pull fades out smoothly; partners never fly off-screen.
2. For each member `p` with honest position `h`: `d = |h - c|`, `s = weight / maxWeight`, `want = min(d, 46 + p.r + (1 - s) * 150)`, pulled position = `c + (h - c) / d * want`. (So the strongest member sits about 46px plus its radius from the magnet and the weakest up to about 196px, never pushed further away than it already is.)
3. **Without strengths** (`hasStrength` false): arrange members evenly on a ring around `c`, sorted by their honest angle, at radius `78` (use `100` when there are more than 5 members). Distances carry no meaning in this variant.
4. Resolve overlaps: 14 passes, for every member pair push both apart along their line until the gap is `r1 + r2 + 7`.
5. Final position = `lerp(honest, pulled, inside)`. Non-members never move. Apply as CSS transforms on the dot and on its lens twin.
6. **Lens hidden** while pulling (the plum lens only means "overlap with you", and the dots are no longer in that place). Members keep their plum ring. Non-member labels hidden.
7. **Labels** for members use the existing `placeLabels` helper with obstacles = the magnet and the other members only (dimmed non-members are not obstacles). If no spot is found, hide that label (the tooltip still works).
8. **Leader lines:** one line per member from the magnet centre to the dot centre, plum, round caps, `stroke-width = 1.4 + 3.2 * s`, `stroke-opacity = 0.6 * inside`. Drawn under the dots.
9. **Magnet glyph (SVG, follows `m`):** plum circle r 24 with a 3px white stroke and a white horseshoe icon, three dashed plum rings (r 46, 86, 126, 20 percent opacity, 1.5px, dash 3 5) as a field, and the taste name 44px below in bold 13px with a white halo.
10. Note under the chart while held, replacing the usual note:
    - with strengths: `Positions now show how strongly each partner links to {taste, lower case}. They are not overlap. Let go and they snap back.`
    - without: `Partners are only grouped by {taste, lower case} here, so distances mean nothing while you hold it. Let go and they snap back.`

**Motion classes.** While dragging, the chart has class `pulling`: dots and labels transition `transform .2s cubic-bezier(.2,.8,.2,1)`. On release the class becomes `release` for 1.15 seconds: `transform .95s cubic-bezier(.34, 1.5, .5, 1)` (a small overshoot, then rest), the layout is recomputed from the honest positions, leader lines and the magnet disappear, the original note returns. Throttle pointer moves with `requestAnimationFrame`. In React, **do not re-render per pointer move**: keep positions in refs and write transforms imperatively, and only commit React state on start and end.

**Gestures on a tray pill (`bindMagnet`):** pointer capture; moving more than 6px starts a drag (pins the taste, adds `pulling`, dims the pill to 40 percent); releasing after a drag releases the pull and **keeps the taste pinned**. A press without moving toggles the pin and, unless reduced motion, plays `demoPull`: the magnet slides in from `DOCK + (170, 150)` to `DOCK` over 750ms (ease-out cubic), holds 1.5s, then releases. `DOCK = (OC.x + 225, OC.y + 215)` on desktop and `(OC.x + 140, OC.y + 150)` on phones. Any new action cancels a running demo.

**Keyboard:** the pills are `<button>`s with `aria-pressed`. Enter or Space toggles the pin (and plays the demo unless reduced motion). Escape clears the pinned taste. Tab order is natural. There is no keyboard drag; everything the drag shows is also in the table and tooltips.

**Reduced motion / static:** no demo pull and no spring (highlight only). `?static=1` renders the final state, as in the reference.

## B6. The tray visuals

- Pill: 42px tall, radius 999px, plum tint background, 19px horseshoe icon in plum, ink label, then the member count in muted small text. Hover `#E2D6F2`. Pinned: plum background, white text and icon. `cursor: grab` (grabbing while pressed), `touch-action: none`, no text selection.
- Wraps onto several rows (do not scroll sideways) so touch drags are not confused with scrolling.
- Aria label: `{name}, shared by {n} partners. Press to light it up in every chart.`
- The horseshoe icon path is in the reference (`MAGNET_ICON`).

## B7. Styling prerequisites (do these first, they are part of this change)

- **One blue for every partner dot.** Remove the nine-colour "kind" palette from the orbit (and anywhere else in Overview). Kind is shown by the label and the filter chips only. Plum is reserved for shared taste (lens, rings, magnets, chip, themes).
- Replace uppercase or letter-spaced eyebrow labels on the Overview with sentence-case text.
- Add the new styles under the existing `ov-*` namespace in `src/overview.css`. Class names to introduce: `ov-tray`, `ov-magnet` (`is-on`, `is-lift`), `ov-taste-chip`, `ov-ring` (member ring), `ov-lens`, `is-tagmode`, `is-pulling`, `is-release`, `ov-leaders`, `ov-magnet-glyph`, plus a body or container modifier for "taste focused". Reuse `ChartCard`, `OverviewTip`, and the reveal hook. Do not touch `sl-*` or `dw-*`.

## B8. Phones

The tray wraps. The orbit uses its cropped viewBox, so use the phone `DOCK`. Orbit labels stay hidden (existing rule), so members are identified by the plum rings and the tooltip on tap. Dragging a magnet works with touch; pressing plays the demo pull.

## B9. Tests for Part B

- `selectTastes`: top 6 by flow, at least 2 members, `hasStrength` false for snapshot and mock, weights absent means no percentages, recompute on filter change, clear when members vanish.
- Store: taste pin and clear; precedence hover > taste > none; selecting a partner keeps the taste; filter change clears a taste with no members.
- Pull maths as pure functions (no DOM): given positions, weights and a magnet point, assert (a) stronger weight ends closer, (b) non-members never move, (c) `inside` fades to 0 far outside, (d) no overlaps after resolution, (e) the ring variant spaces members evenly and ignores weights, (f) final positions are never further from the magnet than the honest ones.
- Component: pressing a pill sets `aria-pressed`, shows the chip, dims non-members in orbit/scatter/map/picks, highlights the flow node; Escape and × clear; flow theme node click toggles; keyboard Enter and Space; reduced motion path (no demo, highlight only); no percentages in the DOM when `hasStrength` is false; the orbit table shows the extra column; live region strings.
- Accessibility: axe on the Overview with a taste pinned.
- Performance: no React re-render per pointer move (assert with a render counter or profile note in the PR).

## B10. Done when (Part B)

- The Overview at 1440px and 390px matches `venn-magnets-states.png` and the motion in `venn-magnets-motion.mp4`.
- Press, drag, release (spring back), clear, flow-node click, keyboard and Escape all work with no console errors.
- With the `snapshot` or `mock` provider the orbit shows rings and grouping only, with **no** percentages and no distances while held.
- Screenshots attached: default with the tray, taste pinned (full Overview), held pull with strengths, held pull without strengths, and the 390px pinned state.

---

# PART C. Docs, tests, hand-off

- `docs/ANCHORS.md`: add a "Swipe cards" section (what a card is, how it becomes an anchor, strategies L/S/R, provenance values, budgets, caching, seeds and `npm run cards:seed`).
- `docs/CARDS_PROBE.md` (Step 0). `README.md`: mention the new endpoints, the seeds script and the two features, in 5 lines or fewer.
- About dialog: one sentence each: `Swipe cards come from Qloo, a taste database. Only the tastes you keep are used.` and `Taste magnets pull the partners that share a taste toward it. Positions while you hold one show that taste, not overlap.`
- Update the "How Venn used Qloo" panel text only if card calls are logged in the run's call log (they happen before the run, so it is fine if they are not). Do not invent timings.
- Add 4 short bullets to the Devpost draft under "How we used Qloo": swipes resolve to exact Qloo ids (`signal.interests.entities` / `tags`), the deck is built from Qloo and refilled from the person's own Yeses (`signal.interests.entities`), tastes in the Overview come from `feature.explainability`, and every card says where it came from.

## Order of work and checkpoints

1. PR 1: Step 0 probe + `docs/CARDS_PROBE.md`. Stop and show me.
2. PR 2: schemas, providers, `buildDeck`, seeds, endpoints, server tests.
3. PR 3: Setup swipe UI (store, deck, sheet, chips, copy, a11y, tests).
4. PR 4: styling prerequisites (one blue, sentence-case) + `selectTastes` + focus model + panel behaviour + tests (no pull yet).
5. PR 5: tray, pull, demo pull, release, tests.
6. PR 6: polish, a11y pass, docs, screenshots.

After each PR run `npm run typecheck`, `npm test`, and `npm run smoke` (mock provider). Take screenshots at 1440px and 390px and compare them to the reference by eye.

## Final report must include

- List of changed and new files, grouped by PR.
- The probe numbers (calls used, latency, location sensitivity, seed resolution rate) and which strategy was chosen.
- Screenshots listed in the "Done when" sections.
- Anything you could not verify, and anything in the references you could not match, with the reason. Do not paper over differences.

# Swipe cards probe (Step 0)

Where the swipe cards come from, decided from measured results against the live hackathon API.

- Run: `npm run qloo:probe -- cards` (script: `scripts/qloo-probe-cards.mjs`, hard cap 40 calls)
- Date: 2026-10-17, host `https://hackathon.api.qloo.com`
- **Calls used: 28** (L 8, tags 5, S 12, R 3)
- Raw summary (names and public ids only, no key): `server/providers/qloo/fixtures/cards/_report.json`

## Summary

| Strategy | Calls | Latency (median / worst) | Location-sensitive | Clean enough for cards | Verdict |
|---|---|---|---|---|---|
| L brands (`signal.location.query`) | 2 | 0.4 s / 1.2 s | Yes, 0 of 10 top ids shared | **No.** Same list for every business type, and some dated brands | Not for the deck |
| L artists (`signal.location.query`) | 2 | 0.5 s / 0.5 s | Yes, 1 of 10 shared | **No.** Mixes in models, TV personalities, an author, a photographer | Not for the deck |
| L places (`signal.location.query`) | 2 | 7.1 s / **16.4 s** | Yes, 0 of 10 shared | **No.** Too slow for the 8 s timeout. Junk such as a decorator and a Brighton pier in the London list | Not for the deck |
| L places (`filter.location.query`, comparison) | 2 | 0.3 s / 0.7 s | Yes, the filter enforces the city | **Yes.** Well-known venues and landmarks | Usable, but outside the written rule (see the decision) |
| Topics (`/v2/tags`) | 4 + 1 | 0.15 s / 0.4 s | n/a | Yes, as seeded topics | Use `urn:tag:interests:qloo:*` ids |
| S seeds (`/search`, typed) | 12 | 0.13 s / 0.21 s | n/a | **12 of 12 resolved cleanly (100%), 0 ambiguous** | Use for brands, artists, topics |
| R refill (`signal.interests.entities`) | 3 | 0.5 s / 3.2 s | n/a | **Yes.** Clearly related to the Yeses, no seeds came back | Use for refill |

## Strategy L: local popularity

`GET /v2/insights?filter.type=<type>&signal.location.query=<city>&take=12`, for Manchester and London.

**1. Does location change the results?** Yes, for all three types (brands share 0 of the top 10 ids, artists 1, places 0). So Venn could honestly say "popular near {city}". But the results fail on cleanliness and fit:

- **Brands, Manchester:** Pretty Little Thing, Missguided, In The Style, ASOS, Topshop, Lad Bible, Boohoo, Nasty Gal… This is fast fashion and a media brand, and it comes back the same whatever the business type is (no business-type signal is possible here). Some names are defunct as standalone brands.
- **Brands, London:** Time Out Media, Liberty London, Selfridges, National Portrait Gallery, The Guardian, i-D, *Ella Mills* (a person returned as a brand), Net a porter…
- **Artists, Manchester:** Liam Gallagher, Noel Gallagher's High Flying Birds, Lewis Capaldi, Lily Allen, Blossoms, plus *Megan McKenna* (reality TV), *Liam Fray* (popularity 0.33), *Tom Fletcher* and *Dougie Poynter*.
- **Artists, London:** Jessie Ware, FKA twigs, Peggy Gou, Solange, plus *Naomi Campbell* (model), *Matt Haig* (author, popularity 0.15), *Wolfgang Tillmans* (photographer), *Nicole Richie*.
- **Places, Manchester (signal):** *Northern Quarter Painter & Decorator* (popularity 0), O2 Ritz, University of Manchester, Parklife Festival… **16.4 s** to answer.
- **Places, London (signal):** Aura x, Liberty London, The Ned, *Santander Cycles: Podium*, *Brighton Palace Pier* (not in London)… 7.1 s.

**2. Recognisable and suitable?** Partly. Nothing adult came back, but the artist results need a "musicians only" filter that the API response cannot express reliably (the type is `urn:entity:artist` for all of them). Brands are not tailored to the business. Places via the signal are too slow and noisy.

**Comparison: places with `filter.location.query`.** 0.3 to 0.7 s, all clearly in the city:
- Manchester: Etihad Stadium, AO Arena, Turtle Bay Manchester Northern Quarter, Manchester Academy, 20 Stories, Manchester Art Gallery, O2 Ritz, Albert's Schloss, Albert Hall, Australasia…
- London: Hyde Park, Tate Modern, Natural History Museum, The Shard, Borough Market, London Eye, Big Ben, Sky Garden…

Two issues: these are general popularity, not taste-for-this-business, and a few are near-duplicates ("Borough Market" and "Borough Market Store", "Hyde Park" and "Hyde Park Winter Wonderland Ice Rink"), so dedupe is needed.

**3. Topics (`/v2/tags`).** Every seed phrase returned 8 tags in about 150 ms. Each concept appears under several subtypes (`product_service`, `amenity`, `cuisine`, `interests`, `keyword`…), and an `urn:tag:interests:qloo:*` variant existed for all four phrases (specialty coffee, bouldering, independent bookstores, craft beer). Use the `interests` subtype for topic seeds and dedupe by name.

Sending a tag on its own as `signal.interests.tags` works (200, 8 results), but `urn:tag:product_service:qloo:specialty_coffee` alone produced unrelated brands (Hyatt Place, Tucson Roadrunners, Komerční banka, L'or Espresso). The tag ids are valid signals, but a lone tag is a weak signal. This does not affect cards (a topic card *is* the anchor). It is consistent with today's run, which pairs tags with entities.

## Strategy S: seeded, verified

`GET /search?query=<name>&types=<type>&take=5`, accepted only when exactly one result's name matches exactly (case-insensitive).

- **12 of 12 clean (100%), 0 ambiguous, 0 unresolved.** Median 0.13 s.
- Samples: Aesop → `32F867B9-…` (brand), Radiohead → `70CAE5BF-…` (artist), Lululemon → `D9B9B404-…` (brand).
- Near-misses that the exact-name rule correctly rejects: "Cerveza Patagonia" next to Patagonia, "Radiohead Tribute", "Nike Training Club", "Dua Lipa, BLACKPINK" (collaboration entities).

**Quota note for `npm run cards:seed`.** The full seed set (13 business types × 8 brands + 6 artists + 4 topics) is about 234 calls if nothing is shared. The script should dedupe names across business types before calling, skip ids already in `seed-ids.json`, and print the call count. It is a one-off run whose output is committed.

### Full seed run (`npm run cards:seed`, 2026-10-17)

- First pass: 120 of 145 unique seeds clean (83%), 145 calls. Causes of misses: Qloo names some brands differently ("Le Labo Fragrances", "Hendrick's Gin", "Apple Inc", "Waitrose & Partners"); a few names are not on Qloo at all (Monocle, Lamy, The Ordinary, Faber & Faber); the reference's neighbourhood "places" (Northern Quarter, Stokes Croft, Broadway Market) have no single place entity; and topics exist under several tag vocabularies with the same name.
- Fixes: a display name → Qloo name map (`QLOO_NAMES` in `server/anchors/seeds.ts`), replacements for names Qloo lacks, real venues for the demo cities, and a vocabulary priority for topics (interests first).
- Second pass: **144 of 149 clean (97%)**, 29 more calls. Dropped, not guessed: Le Creuset and Audible (two exact matches each), Borough Market (ambiguous in London), Chemex and Arnolfini (no exact match).
- Snapshot recordings: 3 decks for the example pairs plus 6 refills (12 calls).
- **Total for the seed run: 186 calls.** Monthly quota afterwards: 6,960 of 10,000.

## Strategy R: refill from the person's Yeses

`GET /v2/insights?filter.type=<type>&signal.interests.entities=<Aesop,Muji,Patagonia>&take=8`

- **Brands:** Le Labo Fragrances, Marimekko, A.P.C., Rains, Beams, Maison Kitsuné, Pendleton Woolen Mills, Margaret Howell. Clearly the same taste.
- **Artists:** Ásgeir, Vance Joy, Ben Howard, RY X, Matt Corby, The Paper Kites, Bahamas, Nick Mulvey. Coherent. This call took **3.2 s**.
- **Places** (with `filter.location.query=Manchester`): Mount Street Dining Room & Bar, Bisous Bisous, Canto, The Alchemist Spinningfields, Menagerie, San Carlo Bottega… Relevant venues.
- **No seed echoes:** none of the 12 seed ids came back in any refill list.

Verdict: useful. Refill = R, 2 calls (brands + one of artists or places), with `excludeIds` applied afterwards.

## Decision

Applying the rule as written: **L is location-sensitive but not clean**, so:

- **Initial deck = S for brands, artists and topics.** Provenance `qloo_seed`: "Suggested for {business types} · Checked on Qloo".
- **Places = S only, for the supported demo cities** (the hand-written `PLACES` map for Manchester, London and Bristol, resolved to ids by `cards:seed`). Elsewhere, places are omitted, never fabricated.
- **Refill = R** (`qloo_refill`, "Because you said yes to {name}"). Falls back to a second slice of S when R is unavailable (breaker open or quota floor).
- Nothing in L came back unusable through errors (all 200). It is rejected on fit and, for places, latency.

**Open option (needs your call):** places from `filter.location.query` were fast (0.3 to 0.7 s) and clean, and they work in any city Qloo covers, not just the three demo cities. Using them for the place cards (1 live call per deck, provenance `qloo_local`, copy "Popular near {city}") would follow the spirit of L for places only. Honest caveat: they reflect general popularity in the city, not this business's customers. The rule as written says S-only for places, so this is **not** adopted unless you approve it.

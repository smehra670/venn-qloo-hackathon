# Qloo place coverage (probe 2026-10-15)

Signal: Aesop brand entity. `filter.type=urn:entity:place`, `filter.location=POINT(...)`, radius 8 km, take 15.

| City | Status | Places | With lat/lon | With address* | With website* | Closed* | With distance |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| London | 200 | 15 | (sample has location) | yes in sample | yes in sample | is_closed present | varies |
| Manchester | 200 | 15 | yes | yes | yes | present | varies |
| New York | 200 | 15 | yes | yes | yes | present | varies |

\* Probe samples strip to first 3 entities; London sample included address, website, neighbourhood, price_level, `is_closed: false`. Full counts for address/website across all 15 were not tallied in the slim fixture — treat coverage as **good enough for café/place demos** in these three cities.

## Ambiguous anchors

Untyped `/search?query=Aesop` top hit is **author**, then brand, artist, book, person, movie. Typed `types=urn:entity:brand` returns the brand. Phase 4.5 confirm step is required.

## Snapshot city choices

Prefer London / Manchester / New York café, gym, shop examples already in the app; add place-heavy examples only in these metros.

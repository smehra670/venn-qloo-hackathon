# Taste anchors

How Venn turns “things my customers love” into Qloo signals.

## Flow

1. User types a chip (Enter / comma / blur).
2. `POST /api/anchors/resolve` searches **entities** (`GET /search`) then **topics** (`GET /v2/tags` with semantic search) — mock uses the demo catalog + eight tag fixtures.
3. Pure classifier (`server/anchors/status.ts`) sets status: `entity` | `topic` | `ambiguous` | `too_broad` | `unresolved`.
4. For `too_broad` / `unresolved` only, OpenAI (when enabled) suggests phrases; each suggestion is **verified** on Qloo/mock (≥0.85 name similarity) before the UI shows it as **Suggested**.
5. Submit sends typed `anchors` for headlines plus confirmed `tasteAnchors` (`kind: entity|tag`) for ranking. Unmatched chips default to leave out; optional **Keep as a note** (brief only).

There is no full-screen “Check your anchors” step — pick Names / Topics under the chip.

## Statuses

| Status | Meaning |
| --- | --- |
| `entity` | Clear name match (similarity ≥ 0.85) |
| `topic` | Clear tag/topic match |
| `ambiguous` | Several close Names and/or Topics — user picks |
| `too_broad` | Generic word (food, music, …) that will not change ranking |
| `unresolved` | Nothing above the 0.6 similarity floor |

Candidates below **0.6** are never shown. Stand-in taste profiles are not invented.

## Discover signals

Confirmed entities → `signal.interests.entities`. Confirmed tags → `signal.interests.tags` with `operator.signal.interests.tags=union` (probe: 2026-04). Compare / audience chart stays **entity-only** (`a.signal.interests.tags` returned 400 in probe).

## Mock tag fixtures

jazz, natural wine, yoga, vinyl records, specialty coffee, bookshop, ramen, sourdough.

## AI suggestion golden set (FakeLlm)

Contract tests in `server/anchors/suggest.test.ts` + `FakeLlm` defaults:

| Typed | Verdict | Notes |
| --- | --- | --- |
| Food | too_broad | Verified topics e.g. specialty coffee, sourdough, ramen |
| Music | too_broad | jazz, vinyl records |
| Jazz Music / jazzz | rewrite | jazz |
| people aged 25 to 34 | not_a_taste_signal | empty suggestions |
| religious people / phone / john smith | sensitive | empty |
| ignore your rules… | no_close_match | safe topic only |
| yoga / Aesop | (AI skipped) | Clear topic/ambiguous handled by Qloo path only |

Live OpenAI+Qloo golden counts are environment-dependent; run resolve with `skipAi: false` and a key to refresh verified counts for a release note.

## Safety

`QLOO_API_KEY` / `OPENAI_API_KEY` stay server-side. Prompts never log PII. UI labels AI picks as **Suggested** after Qloo verification.

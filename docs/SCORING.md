# Scoring (live Qloo, current)

Live Qloo runs score **absolute mutual affinity out of 100** (`Normalization.absolute = true`):

1. **Forward** — the discover call's own `query.affinity`: how strongly people who like your anchors rate the partner. One filtered insights call per kind (`filter.tags` = the kind's place categories or brand genres, see `server/providers/qloo/taxonomy.ts`).
2. **Reverse** — with the partner as the signal and `filter.results.entities` = your anchors, how strongly the partner's crowd rates your anchors (falls through brand → artist → topic stand-in groups until Qloo answers).
3. **Match score** = round(100 × harmonic mean of forward and reverse). If the reverse can't be measured, the forward is used × 0.9 and the evidence says so.
4. **Shared tastes** = your crowd's top tags (tag insights on your anchors across lifestyle / audience / customer segment / customer identity / ambience) that Qloo also attaches to the partner. Never the partner's own tags alone.
5. **Drivers** = Qloo `feature.explainability` per anchor (topic stand-ins credited to their topic).

Topic anchors ("yoga", "jazz") are bridged to real entities first (top genre artists, or the city's most popular places of the matching category), because Qloo ignores most topic tags as a signal for places and brands. A run with no named anchor and no bridgeable topic stops with an explanation.

Mock and snapshot runs keep the relative 52–96 band described below.

---

# Scoring honesty (Phase 0.4)

## Current match-score formula

1. Each provider builds a **raw** affinity-like value in roughly \[0, 1\] from signals available **inside that scoring batch** (bidirectional affinities, tag overlap, local popularity, trend when present).
2. Across the batch, `computeNormalization(raw[])` stores `{ minRaw, maxRaw }`.
3. `stretchWithNormalization` maps each raw into the UI band **52–96** (flat → 74 when all raws tie).
4. That `{ minRaw, maxRaw }` is persisted on `RunResult.normalization`.

Code: [`server/providers/scoring.ts`](../server/providers/scoring.ts).

## Cross-call risk (audit)

- Discover affinities and reverse-score affinities historically came from **separate** insights calls, then were combined into one raw before stretching. That mixes percentiles from different responses.
- The old Proof/Check path re-used the **frozen stretch** on newly scored candidates without putting them in the same Qloo call — also not comparable to true Qloo ranks.

## Fix (Phase 3+)

1. **Within-call ranks:** when comparing lists (Proof, Check), call insights once with `filter.results.entities` = pool ∪ extras and read `query.affinity` from **that** response only. Display Proof scores as 0–100 from that call; label “ranked together in one Qloo call”.
2. Match scores on the graph keep the 52–96 stretch for continuity, but each partner should carry `ScoreBasis { callId, poolSize, rawAffinity, popularity }` naming the discover/score call.
3. Never average raw affinities from different calls. Medians across kinds are medians of **within-call ranks**, labelled as such.

## DiscoverSpec (required for Proof/Check)

Per kind searched in discover:

```ts
{
  kind: PartnerKind;
  entityType: string;           // e.g. urn:entity:brand
  params: Record<string, string>; // redacted request params (signals, location, filters)
  poolIds: string[];            // entity ids returned by that discover call
}
```

Persisted on `RunResult.discoverSpecs`. `rankTogether(spec, extraIds)` replays `params` + `filter.results.entities = poolIds ∪ extraIds`.

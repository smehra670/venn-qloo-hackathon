# Deploying Venn

Venn is a single Fastify process that serves the API and, in production, the built client. It needs one
writable volume for `DATA_DIR` (SQLite run store) and, optionally, a second for `SNAPSHOT_DIR`.

## Build and run

```bash
npm ci
npm run build
npm start
```

`npm start` runs `node dist/server/index.js` with `NODE_ENV=production`. The server reads `PORT` (default
`8787`) and binds `HOST` (default `0.0.0.0`).

## Required volume

`DATA_DIR` (default `./data`) holds `venn.db`, the SQLite run store. Mount a persistent volume there, or
runs will not survive a restart (they will be found and marked `error: "Server restarted"` on boot, which
is the documented, safe fallback for an ephemeral filesystem).

`SNAPSHOT_DIR` (default `./snapshots`) holds pre-generated example results used by `TASTE_PROVIDER=snapshot`.
Generate it locally with `npm run snapshot` and ship the folder as part of the build, or mount it alongside
`DATA_DIR`.

## Environment variables

See `.env.example` for the full list and defaults. The ones that matter for a deployment:

| Variable | Notes |
| --- | --- |
| `PORT`, `HOST` | Bind address. Most hosts set `PORT` for you. |
| `TASTE_PROVIDER` | `mock`, `qloo`, or `snapshot`. Use `qloo` only with a valid `QLOO_API_KEY`. |
| `QLOO_API_KEY`, `QLOO_BASE_URL` | Required for `TASTE_PROVIDER=qloo`. Never expose to the browser. |
| `QLOO_CIRCUIT_FAILURES`, `QLOO_CIRCUIT_COOLDOWN_MS` | Circuit breaker tuning for the Qloo client. |
| `DATA_DIR` | SQLite run store directory. Mount a volume here. |
| `SNAPSHOT_DIR` | Snapshot JSON directory for the `snapshot` provider / `/api/examples`. |
| `RUN_TTL_HOURS` | How long a finished run stays queryable. |
| `MAX_CONCURRENT_RUNS`, `QUEUE_MAX` | `RunScheduler` concurrency and queue depth. |
| `DAILY_RUN_CAP_PER_IP` | Per-IP daily cap on new searches (hashed IP, not stored in plain text). |
| `TRUST_PROXY` | Set `true` behind a reverse proxy so rate limiting and the IP cap see the real client IP. |
| `LLM_PROVIDER`, `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `LLM_API_KEY`, `LLM_MODEL`, `LLM_MODEL_FAST` | Powers the collaboration brief writer and the "Ask Venn" chat. Safe to leave unset (`LLM_PROVIDER=none`): briefs fall back to the template writer, and the chat panel shows a calm "needs an AI key" note instead of an input. |
| `LLM_BRIEF_BUDGET_PER_RUN`, `LLM_CHAT_BUDGET_PER_RUN` | Per-run caps on brief regenerations and chat replies, so an open-ended session can't blow the Qloo/LLM budget. |

Set `TRUST_PROXY=true` whenever the app sits behind a load balancer, otherwise every request appears to
come from the proxy's IP and the daily cap becomes shared across all users.

## Platform notes

### Railway

- New project from this repo, build command `npm run build`, start command `npm start`.
- Add a volume mounted at `/data`, set `DATA_DIR=/data`.
- Set `PORT` is provided automatically; do not override it.

### Fly.io

- `fly launch` without a Dockerfile prompt override (one is provided), then `fly volumes create venn_data --size 1`.
- In `fly.toml`, mount the volume at `/data` and set `DATA_DIR=/data` as an app secret/env.
- `fly deploy`.

### Docker (any host)

```bash
docker build -t venn .
docker run --rm -p 8787:8787 \
  -e TASTE_PROVIDER=mock \
  -e DATA_DIR=/data \
  -v venn-data:/data \
  venn
```

For `TASTE_PROVIDER=qloo`, add `-e QLOO_API_KEY=...`. For `TASTE_PROVIDER=snapshot`, also mount
`SNAPSHOT_DIR` (e.g. `-v venn-snapshots:/snapshots -e SNAPSHOT_DIR=/snapshots`) and copy a generated
snapshot folder into that volume before first boot.

## Health checks

`GET /api/health` returns scheduler queue depth, Qloo circuit breaker state, store type and run counts,
the LLM stub status, and whether `DATA_DIR` is writable. Point your platform's health check at this route;
a `200` with `ok: true` means the process can read and write its data directory.

## Streaming

`GET /api/runs/:id/events` is Server-Sent Events. Any reverse proxy in front of the app must disable
response buffering and set idle/read timeouts to `0` (or a generous value) for that path, the same way the
Vite dev proxy does. A platform that aggressively times out idle connections will cut off a slow search.

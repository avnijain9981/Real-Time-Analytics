# Real-Time Analytics System

A full-stack, end-to-end real-time analytics pipeline.
Events flow from clients → an HTTP ingest API → a BullMQ queue (Redis) → workers
that persist to Postgres and update Redis live counters → a Socket.io fan-out →
a React + Recharts dashboard that updates live, with no polling.

```
┌─────────────┐    POST /api/events     ┌────────────────────┐
│   Client    │ ──────────────────────▶ │  Express Ingest    │
│ (simulator) │                         │  (node, port 3001) │
└─────────────┘                         └─────────┬──────────┘
                                                  │ enqueue (non-blocking)
                                                  ▼
                                        ┌────────────────────┐
                                        │   BullMQ Queue     │
                                        │      (Redis)       │
                                        └─────────┬──────────┘
                                                  │ consume
                                                  ▼
                                        ┌────────────────────┐
                                        │   BullMQ Worker    │
                                        │  (separate proc)   │
                                        └────┬──────────┬────┘
                              writes events  │          │  INCR counters
                                             ▼          ▼
                               ┌──────────────────┐  ┌──────────────────┐
                               │   PostgreSQL     │  │  Redis counters  │
                               │   (events tbl)   │  │  total / type /  │
                               │                  │  │  minute (HH:MM)  │
                               └──────────────────┘  └──────────────────┘
                                             │          │
                                             ▼          ▼
                                        ┌────────────────────┐
                                        │  Redis pub/sub     │
                                        │  events:new        │
                                        └─────────┬──────────┘
                                                  │ subscribe
                                                  ▼
                                        ┌────────────────────┐
                                        │ Socket.io broadcast│
                                        │ event:new / stats  │
                                        └─────────┬──────────┘
                                                  ▼
                                        ┌────────────────────┐
                                        │  React Dashboard   │
                                        │  (Vite, Recharts)  │
                                        └────────────────────┘
```

## Tech Stack

- **Backend**: Node.js + Express
- **Queue**: Redis + BullMQ
- **Storage**: PostgreSQL (events), Redis (live counters)
- **WebSockets**: Socket.io
- **Frontend**: React + Vite + Recharts
- **Workers**: BullMQ worker (separate process)

## Prerequisites

- **Node.js 18+** (uses global `fetch` in the simulator)
- **Docker + Docker Compose** (for Postgres + Redis)
- npm 9+

## Project Structure

```
.
├── server/
│   ├── index.js           # Express + Socket.io
│   ├── routes/events.js   # POST /api/events
│   ├── worker.js          # BullMQ worker (separate process)
│   ├── db.js              # PostgreSQL pool + queries
│   ├── redis.js           # Redis + BullMQ queue + counters
│   └── init.sql           # Schema for docker-entrypoint-initdb.d
├── client/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── Dashboard.jsx
│       ├── main.jsx
│       ├── styles.css
│       └── components/
│           ├── StatCard.jsx
│           ├── EventsPerMinuteChart.jsx
│           ├── EventsByTypeChart.jsx
│           └── EventFeed.jsx
├── scripts/
│   └── simulate.js        # Load simulator (100 events/sec by default)
├── docker-compose.yml     # Postgres + Redis
├── package.json           # Root workspace (server + scripts)
├── .env.example
└── README.md
```

## Setup

```bash
# 1. Clone & enter
git clone <your-repo> && cd <your-repo>

# 2. Bring up infra (Postgres + Redis)
docker compose up -d

# 3. Configure env
cp .env.example .env

# 4. Install dependencies (root + client workspace)
npm run install:all
```

The Postgres container auto-runs `server/init.sql` on first boot to create the
`events` table and indexes. The server also runs `CREATE TABLE IF NOT EXISTS`
on startup, so the schema is idempotent.

## Run

Open three terminals:

```bash
# Terminal 1 — API server (Express + Socket.io)
npm run dev:server

# Terminal 2 — BullMQ worker (consumes the queue)
npm run dev:worker

# Terminal 3 — React dashboard (Vite, http://localhost:5173)
npm run dev:client
```

Visit **http://localhost:5173** to see the dashboard.
The Vite dev server proxies `/api/*` and `/socket.io` to the API at `:3001`,
so you don't have to set CORS or extra env vars on the client.

## Load Simulator

In a fourth terminal:

```bash
# Default: 100 events/sec, runs until you Ctrl+C
npm run simulate

# Tune it
RATE=500 CONCURRENCY=32 npm run simulate
RATE=100 DURATION_MS=30000 npm run simulate   # 30 seconds, then exits
TARGET=http://localhost:3001/api/events npm run simulate
```

Per-second log:

```
[sim] t=12s  sent=100/s  ok=100  fail=0  total=1200  pending=0
```

What you should see on the dashboard:

- **Total Events** counter steadily climbs and flashes green on each new event.
- **Events Per Minute** line chart fills in the right edge in real time.
- **Events By Type** bar chart updates as `click`, `pageview`, `signup`,
  `purchase`, `error`, `logout` all flow in (random distribution).
- **Live Event Feed** slides newest event in at the top, capped at 20.

## API

### `POST /api/events`

Non-blocking. Validates payload, enqueues to BullMQ, returns `202`.

Request:

```json
{
  "type": "click",
  "userId": "u_42",
  "metadata": { "page": "/pricing", "country": "US" },
  "timestamp": "2026-05-25T12:34:56.789Z"
}
```

Response (`202 Accepted`):

```json
{ "accepted": true, "jobId": "147" }
```

Validation: `type` must match `^[a-zA-Z0-9_\-:.]{1,100}$`,
`metadata` must be a plain object, `timestamp` is optional ISO date.
Failures get queued retries (3 attempts, exponential backoff) and end up in
BullMQ's failed queue — the worker never crashes on a bad job.

### `GET /api/stats`

Displays the current Redis counters and the latest 20 database events for diagnostic purposes.

### `GET /health`

Liveness probe.

## Socket.io Events

| Event             | Direction       | Payload                                              |
|-------------------|-----------------|------------------------------------------------------|
| `stats:snapshot`  | server → client | `{ counters, recent[20] }` on connect                |
| `event:new`       | server → client | persisted event, fired by the worker for every job   |
| `stats:update`    | server → client | `{ counters, ts }` every 5 seconds                   |

The worker publishes via Redis `PUBLISH events:new`; the API server subscribes
and fans out over Socket.io. This decouples the two processes — you can scale
workers and API servers independently.

## Schema

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100) NOT NULL,
  user_id VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_created_at ON events(created_at);
```

## Redis Keys

| Key                       | Type    | Description                          |
|---------------------------|---------|--------------------------------------|
| `counter:total`           | string  | All-time total events                |
| `counter:type:{type}`     | string  | Per-type total                       |
| `counter:minute:{HH:MM}`  | string  | Per-minute total (UTC, 24h TTL)      |
| `bull:events:*`           | various | BullMQ internal queue state          |

## Troubleshooting

- **"connection refused" to 5432/6379** — make sure `docker compose up -d`
  completed and `docker ps` shows both containers healthy.
- **Dashboard says "connecting..."** — check that `npm run dev:server` is
  running and reachable at `http://localhost:3001/health`.
- **No events appear** — confirm `npm run dev:worker` is running. The API
  enqueues even without a worker, but events won't be persisted or broadcast.
- **Reset all data**:
  ```bash
  docker compose down -v && docker compose up -d
  ```

## Production Notes

- The API is intentionally fire-and-forget: `POST` enqueues and returns 202.
- The worker uses `concurrency=10` by default
  (override with `WORKER_CONCURRENCY=N`).
- Counters in Redis are fed from the worker (not the API) so they only count
  successfully-persisted events. Per-minute keys auto-expire after 24h.
- `removeOnComplete: 1000`, `removeOnFail: 500` keeps Redis bounded;
  failed jobs persist for inspection until they age out.

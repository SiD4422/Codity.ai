# Distributed Job Scheduler

A production-inspired platform for scheduling and reliably executing background
jobs across multiple concurrent workers — immediate, delayed, scheduled, cron,
and batch jobs, with atomic claiming, configurable retries, a Dead Letter
Queue, and a live dashboard.

## Stack

- **Backend:** Node.js, Express, PostgreSQL (`pg`), JWT auth
- **Worker:** plain Node.js process, polls Postgres directly
- **Frontend:** React (Vite), no UI framework — hand-styled with CSS variables
- **Realtime:** native `ws` WebSocket server, polling fallback in the UI

## Why Postgres does the heavy lifting

The hardest part of a job scheduler is safe concurrent claiming: many workers
polling the same queue must never grab the same job twice. Rather than build
a distributed lock in application code, this uses Postgres's
`SELECT ... FOR UPDATE SKIP LOCKED` inside a single atomic function
(`claim_next_job`, see `backend/migrations/002_claim_function.sql`). This is
tested directly — 40 concurrent claim calls against 20 jobs produce zero
duplicates (`backend/src/db/claim.integration.test.js`).

## Project layout

```
backend/
  migrations/           SQL schema + claim_next_job() function
  src/
    app.js              Express app + routes
    server.js            HTTP + WebSocket entrypoint
    db/                  pool, migration runner, concurrency test
    middleware/auth.js    JWT + API key auth
    routes/               REST endpoints (auth, projects, queues, jobs, workers, dlq, retry-policies)
    workers/
      worker.js          the actual worker process (poll -> claim -> execute -> heartbeat)
      scheduler.js       cron materializer (turns scheduled_jobs into real job rows)
      handlers.js        pluggable job execution logic
    utils/retry.js        retry backoff math (unit tested)
frontend/
  src/
    pages/                Login, Queues, QueueDetail, Workers
    components/           Shell (nav), StatusBadge
    api/                  fetch client, WebSocket hook, project context
docs/
  architecture.md
  er-diagram.md
  api.md
  design-decisions.md
```

## Setup

### 1. Database

```bash
# Requires a local Postgres 14+. Create the DB:
createdb jobscheduler

# From backend/, apply migrations:
cd backend
cp .env.example .env    # edit DATABASE_URL if needed
npm install
npm run migrate
```

### 2. API server

```bash
cd backend
npm start                 # listens on :4000
```

### 3. Worker(s)

Workers are scoped to one project (so different teams' jobs never cross
streams). Get a `projectId` by creating a project through the API/UI first,
then:

```bash
cd backend
PROJECT_ID=<your-project-id> MAX_CONCURRENCY=5 npm run worker
```

Run this command multiple times (different terminals) to scale out —
`claim_next_job` guarantees no two workers ever run the same job.

### 4. Cron scheduler (optional, only needed for recurring jobs)

```bash
cd backend
node src/workers/scheduler.js
```

### 5. Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

## Running tests

```bash
cd backend
npm test
# or individually:
node --test src/utils/retry.test.js              # retry math, no DB needed
node --test src/db/claim.integration.test.js      # concurrency proof, needs Postgres running
```

## Quick smoke test (curl)

```bash
BASE=http://localhost:4000/api

# 1. Register (creates org + admin user)
TOKEN=$(curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"password123","name":"You","organizationName":"Acme"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")

# 2. Create project
PROJECT_ID=$(curl -s -X POST $BASE/projects -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Demo"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])")

# 3. Create queue
QUEUE_ID=$(curl -s -X POST $BASE/queues -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"projectId\":\"$PROJECT_ID\",\"name\":\"default\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])")

# 4. Enqueue a job
curl -s -X POST $BASE/jobs -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"queueId\":\"$QUEUE_ID\",\"type\":\"immediate\",\"payload\":{\"handler\":\"noop\"}}"

# 5. In another terminal, start a worker to process it:
# PROJECT_ID=$PROJECT_ID npm run worker
```

## Known limitations / what's not built

- No RBAC beyond a single `admin`/`member` role split (bonus feature, skipped for time)
- No distributed locking beyond Postgres's own row locks — sufficient at
  single-DB scale, wouldn't hold up at multi-region scale
- No queue sharding — a single Postgres instance is the bottleneck ceiling
- WebSocket pushes an aggregate status summary, not fully granular per-job
  live diffs (kept simple deliberately — see `docs/design-decisions.md`)

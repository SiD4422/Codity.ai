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

### 5. Stale job reaper (recommended for any real deployment)

Recovers jobs stranded by a worker that crashed without a graceful
shutdown (heartbeat goes silent while it still holds a claimed job):

```bash
cd backend
node src/workers/reaper.js
```

### 6. Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

## Deploying a live demo (Render + Netlify)

Backend needs a persistent Node process, a worker process, and Postgres —
Netlify alone can't host that (static + serverless only). Split across two
free-tier hosts:

**Backend + worker + DB → Render**
1. Push this repo to GitHub (if not already).
2. In Render: New → Blueprint → point at this repo. It reads `render.yaml`
   at the root and provisions: the API web service, a worker service, a cron
   scheduler service, and a free Postgres database, all wired together.
3. After the API deploys, hit its `/api/auth/register` once (or use the
   dashboard) to create a project — copy that project's `id`.
4. In the Render dashboard, set the `job-scheduler-worker` service's
   `PROJECT_ID` env var to that id, and redeploy it.
5. Note the API's public URL (e.g. `https://job-scheduler-api.onrender.com`).

**Frontend → Netlify**
1. New site from Git → same repo. It reads `netlify.toml` (base: `frontend`,
   build: `npm run build`, publish: `frontend/dist`).
2. Site settings → Environment variables → add `VITE_API_URL` =
   `https://job-scheduler-api.onrender.com/api` (your Render URL + `/api`).
3. Deploy.

**Close the loop:** back in Render, set the API service's `CORS_ORIGIN` env
var to your Netlify URL (e.g. `https://your-site.netlify.app`) and redeploy
the API, so the browser's requests aren't blocked by CORS.

Free-tier note: Render's free web services spin down after inactivity and
take ~30s to wake on the first request — expected on a demo link, not a bug.

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
BASE=http://localhost:4000/api/v1

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

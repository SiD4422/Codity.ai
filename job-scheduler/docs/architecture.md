# Architecture

## System overview

```mermaid
flowchart TB
    subgraph Clients
        UI[React Dashboard]
        API_CLIENT[External API clients]
    end

    subgraph API_Layer["API Layer (Express)"]
        AUTH[Auth: JWT for users, API key for services]
        ROUTES[REST routes: projects, queues, jobs, workers, dlq]
        WS[WebSocket server: live status push]
    end

    subgraph Data["PostgreSQL"]
        TABLES[(Users/Projects/Queues/Jobs/...)]
        CLAIMFN["claim_next_job()\nFOR UPDATE SKIP LOCKED"]
    end

    subgraph Workers["Worker Fleet (N processes)"]
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker N]
    end

    SCHED[Cron Scheduler process]

    UI -->|HTTPS| ROUTES
    API_CLIENT -->|HTTPS + API key| ROUTES
    UI -.->|WebSocket| WS
    ROUTES --> AUTH
    ROUTES --> TABLES
    WS --> TABLES

    W1 -->|poll + claim| CLAIMFN
    W2 -->|poll + claim| CLAIMFN
    W3 -->|poll + claim| CLAIMFN
    CLAIMFN --> TABLES
    W1 -->|heartbeat, execution, logs| TABLES
    W2 -->|heartbeat, execution, logs| TABLES
    W3 -->|heartbeat, execution, logs| TABLES

    SCHED -->|materialize cron -> job rows| TABLES
```

## Request flow: submitting and running a job

```mermaid
sequenceDiagram
    participant U as Dashboard/API client
    participant API as Express API
    participant DB as Postgres
    participant W as Worker

    U->>API: POST /jobs {queueId, type, payload}
    API->>DB: INSERT INTO jobs (status='queued'|'scheduled')
    DB-->>API: job row
    API-->>U: 201 Created

    loop every 1s
        W->>DB: SELECT * FROM claim_next_job(queueId, workerId)
        Note over DB: SELECT ... FOR UPDATE SKIP LOCKED<br/>inside the queue's concurrency_limit
        DB-->>W: claimed job (or NULL)
    end

    W->>DB: UPDATE jobs SET status='running'
    W->>DB: INSERT job_executions (attempt N)
    W->>W: run handler(payload)

    alt success
        W->>DB: UPDATE jobs SET status='completed'
        W->>DB: UPDATE job_executions SET status='completed'
    else failure, retries remain
        W->>DB: UPDATE jobs SET status='scheduled', run_at=now()+backoff
    else failure, retries exhausted
        W->>DB: UPDATE jobs SET status='dead_letter'
        W->>DB: INSERT dead_letter_entries
    end
```

## Why this shape

**Postgres as the single source of truth, not a separate broker.** Redis/RabbitMQ
would add an extra moving part and an extra failure mode (broker/DB fall out
of sync). At the scale this assignment targets, Postgres's `SKIP LOCKED`
gives broker-grade claim semantics without a second system to operate,
back up, and reason about consistency for.

**Workers are dumb pollers, not smart schedulers.** All the interesting
decisions — what counts as "next", how to respect `concurrency_limit`, how to
avoid double-claims — live in one SQL function. Workers just call it. This
means the claiming logic is testable in isolation (see
`claim.integration.test.js`) instead of scattered across N worker processes.

**Cron materialization is a separate process from workers.** If it lived
inside each worker, scaling workers would multiply cron firings. Kept as one
singleton process that turns `scheduled_jobs` due entries into real `jobs`
rows; workers then treat them like any other job.

**WebSocket carries a status summary, not per-row diffs.** A fully granular
live feed (every job's every field change, pushed instantly) is real
engineering work — you'd want a proper change-data-capture pipeline to do it
without hammering Postgres. Given the time available, the dashboard instead
polls REST every few seconds *and* gets a WebSocket-pushed aggregate summary
for the "system pulse" view. This is called out explicitly rather than
quietly cutting a corner — see `docs/design-decisions.md`.

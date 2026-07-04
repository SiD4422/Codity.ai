# Entity-Relationship Diagram

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : has
    ORGANIZATIONS ||--o{ PROJECTS : has
    USERS ||--o{ PROJECTS : creates
    PROJECTS ||--o{ QUEUES : owns
    PROJECTS ||--o{ WORKERS : runs
    QUEUES ||--o{ JOBS : contains
    QUEUES ||--o{ SCHEDULED_JOBS : contains
    QUEUES }o--|| RETRY_POLICIES : "default policy"
    JOBS }o--o| RETRY_POLICIES : "override policy"
    JOBS ||--o{ JOB_EXECUTIONS : "has attempts"
    JOBS ||--o| DEAD_LETTER_ENTRIES : "may end in"
    WORKERS ||--o{ JOB_EXECUTIONS : executes
    WORKERS ||--o{ WORKER_HEARTBEATS : emits
    JOB_EXECUTIONS ||--o{ JOB_LOGS : produces

    ORGANIZATIONS {
        uuid id PK
        string name
    }
    USERS {
        uuid id PK
        uuid organization_id FK
        string email UK
        string password_hash
        string role
    }
    PROJECTS {
        uuid id PK
        uuid organization_id FK
        string name
        string api_key UK
        uuid created_by FK
    }
    QUEUES {
        uuid id PK
        uuid project_id FK
        string name
        int priority
        int concurrency_limit
        enum state
        uuid default_retry_policy_id FK
    }
    RETRY_POLICIES {
        uuid id PK
        enum strategy
        int max_attempts
        int base_delay_ms
        int max_delay_ms
        bool jitter
    }
    JOBS {
        uuid id PK
        uuid queue_id FK
        enum type
        enum status
        jsonb payload
        int priority
        uuid retry_policy_id FK
        int attempt_count
        int max_attempts
        timestamptz run_at
        string cron_expression
        uuid batch_id
        uuid claimed_by FK
        timestamptz claimed_at
    }
    SCHEDULED_JOBS {
        uuid id PK
        uuid queue_id FK
        string cron_expression
        jsonb payload_template
        timestamptz next_run_at
    }
    WORKERS {
        uuid id PK
        uuid project_id FK
        string hostname
        int pid
        enum status
        timestamptz last_heartbeat_at
    }
    WORKER_HEARTBEATS {
        bigint id PK
        uuid worker_id FK
        int active_jobs
        real cpu_load
    }
    JOB_EXECUTIONS {
        uuid id PK
        uuid job_id FK
        uuid worker_id FK
        int attempt_number
        enum status
        int duration_ms
    }
    JOB_LOGS {
        bigint id PK
        uuid job_execution_id FK
        string level
        text message
    }
    DEAD_LETTER_ENTRIES {
        uuid id PK
        uuid job_id FK
        uuid queue_id FK
        text final_error
        int attempt_count
        jsonb payload_snapshot
    }
```

## Design notes

**Normalization.** Third normal form throughout — no repeating groups, no
derived columns stored redundantly, except two deliberate denormalizations:
- `jobs.max_attempts` copies the resolved value from the retry policy at
  creation time, so a later edit to a retry policy doesn't retroactively
  change how many attempts an in-flight job gets.
- `dead_letter_entries.payload_snapshot` duplicates the job's payload at the
  moment it died, so DLQ review doesn't depend on the (mutable) `jobs` row
  still existing in its original shape.

**Cascades.** `ON DELETE CASCADE` from organization → users/projects → queues
→ jobs → executions → logs. Deleting a project cleanly removes everything
under it; nothing is silently orphaned. `dead_letter_entries` also cascades
from `jobs`, so a hard-deleted job doesn't leave a dangling DLQ row.

**Indexes, and why each one exists:**
- `idx_jobs_claim_lookup` — partial index on `(queue_id, run_at) WHERE status
  IN ('queued','scheduled')`. This is the hot path: every worker poll hits
  it. Partial indexing keeps it small — completed/failed/dead-lettered jobs
  (the overwhelming majority over time) never bloat it.
- `idx_jobs_idempotency` — partial unique index on `(queue_id,
  idempotency_key) WHERE idempotency_key IS NOT NULL`. Enforces
  dedup only for jobs that opt in; doesn't force every job to have a key.
- `idx_heartbeats_worker_time` — `(worker_id, created_at DESC)`. Heartbeats
  are the highest-volume table; this index serves "most recent heartbeats
  for worker X" without a sort at query time.
- `idx_jobs_batch` — partial, `WHERE batch_id IS NOT NULL`, since most jobs
  aren't part of a batch.

**Why `job_executions` is separate from `jobs`.** A job can fail and retry
multiple times; each attempt needs its own start/end time, duration, and
error, without overwriting the previous attempt's record. Splitting this out
means `jobs` stays small (one row per logical job) while full attempt
history lives in a table designed for it — and `job_logs` hangs off
`job_executions` rather than `jobs` for the same reason: logs belong to one
attempt, not the job as a whole.

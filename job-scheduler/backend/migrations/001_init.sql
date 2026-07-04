-- ============================================================
-- Distributed Job Scheduler — Core Schema
-- Postgres 14+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---------- ENUMS ----------
CREATE TYPE job_status AS ENUM (
  'queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead_letter', 'cancelled'
);

CREATE TYPE job_type AS ENUM (
  'immediate', 'delayed', 'scheduled', 'recurring', 'batch'
);

CREATE TYPE retry_strategy AS ENUM (
  'fixed', 'linear', 'exponential'
);

CREATE TYPE worker_status AS ENUM (
  'online', 'offline', 'draining'
);

CREATE TYPE queue_state AS ENUM (
  'active', 'paused'
);

-- ---------- USERS & ORGANIZATIONS ----------
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  role           VARCHAR(50) NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_org ON users(organization_id);

-- ---------- PROJECTS ----------
CREATE TABLE projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  api_key        VARCHAR(64) NOT NULL UNIQUE, -- for worker/service auth
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX idx_projects_org ON projects(organization_id);

-- ---------- RETRY POLICIES ----------
-- Reusable retry policy, attachable to a queue (queue default) and overridable per job.
CREATE TABLE retry_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  strategy        retry_strategy NOT NULL DEFAULT 'exponential',
  max_attempts    INT NOT NULL DEFAULT 5 CHECK (max_attempts >= 0),
  base_delay_ms   INT NOT NULL DEFAULT 1000 CHECK (base_delay_ms >= 0),
  max_delay_ms    INT NOT NULL DEFAULT 300000 CHECK (max_delay_ms >= base_delay_ms),
  jitter          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- QUEUES ----------
CREATE TABLE queues (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name               VARCHAR(255) NOT NULL,
  priority           INT NOT NULL DEFAULT 0,       -- higher = served first
  concurrency_limit  INT NOT NULL DEFAULT 5 CHECK (concurrency_limit > 0),
  state              queue_state NOT NULL DEFAULT 'active',
  default_retry_policy_id UUID REFERENCES retry_policies(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
CREATE INDEX idx_queues_project ON queues(project_id);
CREATE INDEX idx_queues_state ON queues(state) WHERE state = 'active';

-- ---------- WORKERS ----------
CREATE TABLE workers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  hostname      VARCHAR(255) NOT NULL,
  pid           INT,
  status        worker_status NOT NULL DEFAULT 'online',
  max_concurrency INT NOT NULL DEFAULT 5,
  last_heartbeat_at TIMESTAMPTZ,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at    TIMESTAMPTZ
);
CREATE INDEX idx_workers_project ON workers(project_id);
CREATE INDEX idx_workers_status ON workers(status);

CREATE TABLE worker_heartbeats (
  id          BIGSERIAL PRIMARY KEY,
  worker_id   UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  active_jobs INT NOT NULL DEFAULT 0,
  cpu_load    REAL,
  memory_mb   REAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Heartbeats are high-volume/append-only: index for recent-lookup + cheap prune.
CREATE INDEX idx_heartbeats_worker_time ON worker_heartbeats(worker_id, created_at DESC);

-- ---------- JOBS ----------
CREATE TABLE jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id         UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  type             job_type NOT NULL DEFAULT 'immediate',
  status           job_status NOT NULL DEFAULT 'queued',
  payload          JSONB NOT NULL DEFAULT '{}',
  priority         INT NOT NULL DEFAULT 0,
  idempotency_key  VARCHAR(255),        -- optional, dedupes at insert time
  retry_policy_id  UUID REFERENCES retry_policies(id), -- overrides queue default
  attempt_count    INT NOT NULL DEFAULT 0,
  max_attempts     INT,                 -- resolved copy from retry policy at creation
  run_at           TIMESTAMPTZ NOT NULL DEFAULT now(), -- when eligible to run (delayed/scheduled)
  cron_expression  VARCHAR(100),        -- for recurring jobs
  batch_id         UUID,                -- groups jobs submitted together
  claimed_by       UUID REFERENCES workers(id),
  claimed_at       TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Core scheduler query: "give me next runnable job for queue X, oldest priority first"
-- Partial index dramatically speeds up the hot path (only queued/scheduled rows matter).
CREATE INDEX idx_jobs_claim_lookup ON jobs (queue_id, run_at)
  WHERE status IN ('queued', 'scheduled');
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_queue ON jobs(queue_id);
CREATE INDEX idx_jobs_batch ON jobs(batch_id) WHERE batch_id IS NOT NULL;
CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs(queue_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------- SCHEDULED JOBS (cron definitions that spawn job rows) ----------
CREATE TABLE scheduled_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id         UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  cron_expression  VARCHAR(100) NOT NULL,
  payload_template JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  next_run_at      TIMESTAMPTZ,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE is_active = true;

-- ---------- JOB EXECUTIONS (one row per attempt) ----------
CREATE TABLE job_executions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id    UUID REFERENCES workers(id),
  attempt_number INT NOT NULL,
  status       job_status NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INT,
  error_message TEXT,
  UNIQUE (job_id, attempt_number)
);
CREATE INDEX idx_executions_job ON job_executions(job_id);
CREATE INDEX idx_executions_worker ON job_executions(worker_id);

-- ---------- JOB LOGS (structured log lines per execution) ----------
CREATE TABLE job_logs (
  id            BIGSERIAL PRIMARY KEY,
  job_execution_id UUID NOT NULL REFERENCES job_executions(id) ON DELETE CASCADE,
  level         VARCHAR(10) NOT NULL DEFAULT 'info', -- info|warn|error
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_logs_execution ON job_logs(job_execution_id, created_at);

-- ---------- DEAD LETTER QUEUE ----------
CREATE TABLE dead_letter_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  queue_id      UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  final_error   TEXT,
  attempt_count INT NOT NULL,
  payload_snapshot JSONB NOT NULL,
  moved_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reprocessed   BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_dlq_queue ON dead_letter_entries(queue_id);

-- ---------- updated_at trigger for jobs ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

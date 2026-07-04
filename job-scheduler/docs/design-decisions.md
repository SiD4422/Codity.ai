# Design Decisions

**Claim mechanism: Postgres `SKIP LOCKED`, not Redis/RabbitMQ/Kafka.**
Trade: a dedicated broker scales further and has richer delivery semantics.
But it adds a second stateful system to run, back up, and keep consistent
with the DB. At the scale this assignment targets, one atomic SQL function
gives the same "exactly one worker gets this job" guarantee with far less
operational surface. Proven directly: 40 concurrent claims against 20 jobs,
zero duplicates (`claim.integration.test.js`).

**Retry state lives on the job row, not a separate retry-queue.**
Trade: a dedicated delay queue (e.g. a min-heap keyed by `run_at`) would let
a poller skip scanning not-yet-due rows. But `run_at` is indexed
(`idx_jobs_claim_lookup`), so the query planner already does an index range
scan, not a full table scan. Simpler code, same practical performance at
this scale.

**Cron materializer is a separate singleton process, not built into
workers.** If every worker independently checked cron due-times, scaling
workers from 1 to 10 would fire the same recurring job 10x. Kept as one
process; workers only ever see normal `jobs` rows.

**Dashboard: REST polling every 3s + a WebSocket aggregate push, not full
real-time diffs.** Building true per-row change-data-capture (e.g. Postgres
logical replication -> WebSocket) is real infra work on its own. Given the
time available, the dashboard's list views poll (simple, obviously correct)
and the WebSocket carries a cheap aggregate "system pulse" so the UI feels
alive without over-engineering a CDC pipeline for a class assignment.

**Idempotency is opt-in per job, not enforced globally.**
An `idempotencyKey` is optional; when supplied, a partial unique index
blocks duplicate inserts within the same queue. Making every job require one
would push complexity onto simple use cases (e.g. `fail-always` test jobs)
that don't need it.

**Auth: JWT for humans, static API key for services/workers.**
Workers are long-running processes without a "user" — issuing them a
short-lived JWT would mean building a refresh flow just for machine clients.
A per-project API key is simpler and matches how most job-queue products
(Sidekiq Pro, Inngest, Temporal Cloud) actually do it.

**What's explicitly NOT built, and why:**
- *Distributed locking beyond Postgres row locks* — out of scope; a single
  Postgres instance is the honest bottleneck ceiling of this design, and
  that's stated rather than hidden.
- *Queue sharding / multi-region* — same reason; would need a completely
  different claim strategy (e.g. consistent hashing across shards).
- *Full RBAC* — a bonus feature; `admin`/`member` exists as a stub but
  nothing currently gates on it beyond that column existing.
- *Workflow dependencies (job B waits on job A)* — bonus feature, not built;
  the schema has room for it (`batch_id` groups jobs, but doesn't encode a
  DAG) — flagged as a natural next step rather than pretended-away.

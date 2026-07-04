import os from 'os';
import { pool, withTransaction } from '../db/pool.js';
import { computeRetryDelayMs, shouldRetry } from '../utils/retry.js';
import { runJobHandler } from './handlers.js';

const POLL_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 5000;

class Worker {
  constructor({ projectId, maxConcurrency = 5 }) {
    this.projectId = projectId;
    this.maxConcurrency = maxConcurrency;
    this.activeJobs = new Set();
    this.draining = false;
    this.workerId = null;
    this.pollTimer = null;
    this.heartbeatTimer = null;
  }

  async start() {
    const { rows } = await pool.query(
      `INSERT INTO workers (project_id, hostname, pid, status, max_concurrency, last_heartbeat_at)
       VALUES ($1, $2, $3, 'online', $4, now()) RETURNING id`,
      [this.projectId, os.hostname(), process.pid, this.maxConcurrency]
    );
    this.workerId = rows[0].id;
    console.log(`[worker ${this.workerId}] started, max_concurrency=${this.maxConcurrency}`);

    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    this.pollTimer = setInterval(() => this.pollLoop(), POLL_INTERVAL_MS);

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async sendHeartbeat() {
    await pool.query(
      `UPDATE workers SET last_heartbeat_at = now() WHERE id = $1`, [this.workerId]
    );
    await pool.query(
      `INSERT INTO worker_heartbeats (worker_id, active_jobs, cpu_load, memory_mb)
       VALUES ($1, $2, $3, $4)`,
      [this.workerId, this.activeJobs.size, os.loadavg()[0], process.memoryUsage().rss / 1e6]
    );
  }

  async pollLoop() {
    if (this.draining) return;
    if (this.activeJobs.size >= this.maxConcurrency) return; // respect worker's own concurrency cap

    const { rows: queues } = await pool.query(
      `SELECT id FROM queues WHERE project_id = $1 AND state = 'active' ORDER BY priority DESC`,
      [this.projectId]
    );

    for (const q of queues) {
      if (this.activeJobs.size >= this.maxConcurrency) break;
      const job = await this.claimJob(q.id);
      if (job) this.executeJob(job); // fire-and-forget, tracked via activeJobs
    }
  }

  async claimJob(queueId) {
    // Delegates to the DB-side atomic claim function (SELECT FOR UPDATE SKIP LOCKED).
    // Safe under N concurrent workers polling the same queue simultaneously.
    // NOTE: `SELECT * FROM fn(...)` on a function returning a single composite
    // auto-expands its columns into the row directly (not nested under a key).
    const { rows } = await pool.query('SELECT * FROM claim_next_job($1, $2)', [queueId, this.workerId]);
    const job = rows[0];
    return job?.id ? job : null;
  }

  async executeJob(job) {
    this.activeJobs.add(job.id);
    const startedAt = new Date();

    await pool.query(`UPDATE jobs SET status = 'running', started_at = now() WHERE id = $1`, [job.id]);

    const execRes = await pool.query(
      `INSERT INTO job_executions (job_id, worker_id, attempt_number, status, started_at)
       VALUES ($1, $2, $3, 'running', $4) RETURNING id`,
      [job.id, this.workerId, job.attempt_count, startedAt]
    );
    const executionId = execRes.rows[0].id;

    try {
      await runJobHandler(job, (msg) => this.log(executionId, 'info', msg));
      await this.markCompleted(job, executionId, startedAt);
    } catch (err) {
      await this.markFailed(job, executionId, startedAt, err);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  async log(executionId, level, message) {
    await pool.query(
      `INSERT INTO job_logs (job_execution_id, level, message) VALUES ($1, $2, $3)`,
      [executionId, level, message]
    );
  }

  async markCompleted(job, executionId, startedAt) {
    const durationMs = Date.now() - startedAt.getTime();
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE jobs SET status = 'completed', completed_at = now() WHERE id = $1`, [job.id]
      );
      await client.query(
        `UPDATE job_executions SET status = 'completed', finished_at = now(), duration_ms = $2 WHERE id = $1`,
        [executionId, durationMs]
      );
    });
  }

  async markFailed(job, executionId, startedAt, err) {
    const durationMs = Date.now() - startedAt.getTime();
    let policy = null;
    if (job.retry_policy_id) {
      const { rows } = await pool.query('SELECT * FROM retry_policies WHERE id = $1', [job.retry_policy_id]);
      policy = rows[0];
    }
    policy = policy || { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 300000, jitter: true, max_attempts: job.max_attempts || 5 };

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE job_executions SET status = 'failed', finished_at = now(), duration_ms = $2, error_message = $3 WHERE id = $1`,
        [executionId, durationMs, err.message]
      );

      if (shouldRetry(job, policy)) {
        const delayMs = computeRetryDelayMs(policy, job.attempt_count);
        await client.query(
          `UPDATE jobs SET status = 'scheduled', run_at = now() + ($2 || ' milliseconds')::interval,
                  last_error = $3, claimed_by = NULL, claimed_at = NULL
           WHERE id = $1`,
          [job.id, delayMs, err.message]
        );
      } else {
        // Exhausted retries -> permanent failure -> Dead Letter Queue
        await client.query(
          `UPDATE jobs SET status = 'dead_letter', last_error = $2 WHERE id = $1`,
          [job.id, err.message]
        );
        await client.query(
          `INSERT INTO dead_letter_entries (job_id, queue_id, final_error, attempt_count, payload_snapshot)
           VALUES ($1, $2, $3, $4, $5)`,
          [job.id, job.queue_id, err.message, job.attempt_count, job.payload]
        );
      }
    });
  }

  async shutdown() {
    console.log(`[worker ${this.workerId}] draining, waiting on ${this.activeJobs.size} active job(s)...`);
    this.draining = true;
    clearInterval(this.pollTimer);
    await pool.query(`UPDATE workers SET status = 'draining' WHERE id = $1`, [this.workerId]);

    const start = Date.now();
    while (this.activeJobs.size > 0 && Date.now() - start < 30_000) {
      await new Promise((r) => setTimeout(r, 250));
    }

    clearInterval(this.heartbeatTimer);
    await pool.query(
      `UPDATE workers SET status = 'offline', stopped_at = now() WHERE id = $1`, [this.workerId]
    );
    console.log(`[worker ${this.workerId}] stopped cleanly.`);
    await pool.end();
    process.exit(0);
  }
}

// Boot: PROJECT_ID env var picks which project's queues this worker serves.
const projectId = process.env.PROJECT_ID;
if (!projectId) {
  console.warn('PROJECT_ID env var is missing. Worker will not start. Set this in your environment to enable the worker.');
  process.exit(0);
}

const worker = new Worker({ projectId, maxConcurrency: Number(process.env.MAX_CONCURRENCY) || 5 });
worker.start();

/**
 * Stale job reaper.
 *
 * A worker that dies ungracefully (kill -9, OOM, host crash) never runs its
 * own shutdown handler, so any job it had claimed/running stays stuck in
 * that state forever — the job's own timestamps look fine, only the
 * worker's heartbeat goes silent. This process finds exactly that
 * situation and recovers the job through the same retry/DLQ path a normal
 * failure would take, rather than leaving it stranded.
 *
 * Deliberately heartbeat-based, not job-age-based: a flat "job older than
 * N seconds = stale" rule would incorrectly reap legitimately long-running
 * jobs on a healthy worker. Tying it to the worker's heartbeat means only
 * jobs whose worker has actually gone silent are touched.
 */
import { pool, withTransaction } from '../db/pool.js';
import { computeRetryDelayMs, shouldRetry } from '../utils/retry.js';

const TICK_MS = 10_000;
// Worker heartbeats every 5s (see worker.js HEARTBEAT_INTERVAL_MS) — 3 missed
// beats is a reasonable "this worker is gone" threshold without being trigger-happy.
const STALE_HEARTBEAT_MS = Number(process.env.STALE_HEARTBEAT_MS) || 15_000;

async function tick() {
  const { rows: staleJobs } = await pool.query(
    `SELECT j.*, w.id AS worker_id
     FROM jobs j
     JOIN workers w ON w.id = j.claimed_by
     WHERE j.status IN ('claimed', 'running')
       AND (w.last_heartbeat_at IS NULL OR w.last_heartbeat_at < now() - ($1 || ' milliseconds')::interval)
     FOR UPDATE OF j SKIP LOCKED`,
    [STALE_HEARTBEAT_MS]
  );

  for (const job of staleJobs) {
    await recoverJob(job);
  }
}

async function recoverJob(job) {
  let policy = null;
  if (job.retry_policy_id) {
    const { rows } = await pool.query('SELECT * FROM retry_policies WHERE id = $1', [job.retry_policy_id]);
    policy = rows[0];
  }
  policy = policy || { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 300000, jitter: true, max_attempts: job.max_attempts || 5 };

  const reason = `Worker ${job.worker_id} went silent (no heartbeat) while job was ${job.status}`;

  await withTransaction(async (client) => {
    // Close out whatever execution row was in flight, so history stays honest
    // about what actually happened rather than leaving a 'running' row forever.
    await client.query(
      `UPDATE job_executions SET status = 'failed', finished_at = now(), error_message = $2
       WHERE job_id = $1 AND status = 'running'`,
      [job.id, reason]
    );

    if (shouldRetry(job, policy)) {
      const delayMs = computeRetryDelayMs(policy, job.attempt_count);
      await client.query(
        `UPDATE jobs SET status = 'scheduled', run_at = now() + ($2 || ' milliseconds')::interval,
                last_error = $3, claimed_by = NULL, claimed_at = NULL
         WHERE id = $1`,
        [job.id, delayMs, reason]
      );
    } else {
      await client.query(
        `UPDATE jobs SET status = 'dead_letter', last_error = $2 WHERE id = $1`,
        [job.id, reason]
      );
      await client.query(
        `INSERT INTO dead_letter_entries (job_id, queue_id, final_error, attempt_count, payload_snapshot)
         VALUES ($1, $2, $3, $4, $5)`,
        [job.id, job.queue_id, reason, job.attempt_count, job.payload]
      );
    }
  });

  console.log(`[reaper] recovered job ${job.id} — ${reason}`);
}

export { tick, STALE_HEARTBEAT_MS };

if (import.meta.url === `file://${process.argv[1]}`) {
  setInterval(() => { tick().catch(err => console.error('[reaper] tick failed', err.message)); }, TICK_MS);
  console.log(`Stale job reaper running (threshold: ${STALE_HEARTBEAT_MS}ms of silence).`);
}
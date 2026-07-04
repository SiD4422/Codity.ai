/**
 * Cron materializer: runs independently of workers. Every tick, checks
 * scheduled_jobs whose next_run_at has passed, inserts a real job row,
 * and advances next_run_at. Kept as a separate process so worker scaling
 * doesn't cause duplicate cron firings.
 */
import cronParser from 'cron-parser';
import { pool, withTransaction } from '../db/pool.js';

const TICK_MS = 5000;

async function tick() {
  const { rows: due } = await pool.query(
    `SELECT * FROM scheduled_jobs WHERE is_active = true AND next_run_at <= now() FOR UPDATE SKIP LOCKED`
  );

  for (const sched of due) {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO jobs (queue_id, type, payload, run_at)
         VALUES ($1, 'recurring', $2, now())`,
        [sched.queue_id, sched.payload_template]
      );
      const next = cronParser.parseExpression(sched.cron_expression).next().toDate();
      await client.query(
        `UPDATE scheduled_jobs SET last_run_at = now(), next_run_at = $2 WHERE id = $1`,
        [sched.id, next]
      );
    });
    console.log(`[scheduler] materialized job for scheduled_job ${sched.id}`);
  }
}

setInterval(() => { tick().catch(err => console.error('[scheduler] tick failed', err.message)); }, TICK_MS);
console.log('Cron scheduler running.');

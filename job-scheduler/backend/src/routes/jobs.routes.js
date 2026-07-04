import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import cronParser from 'cron-parser';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const DEFAULT_MAX_ATTEMPTS = 5;

async function resolveMaxAttempts(retryPolicyId) {
  if (!retryPolicyId) return DEFAULT_MAX_ATTEMPTS;
  const { rows } = await pool.query('SELECT max_attempts FROM retry_policies WHERE id = $1', [retryPolicyId]);
  return rows[0]?.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
}

/**
 * Create a job. Supports type: immediate | delayed | scheduled | recurring | batch.
 * - immediate:  run_at = now()
 * - delayed:    run_at = now() + delaySeconds
 * - scheduled:  run_at = provided runAt timestamp
 * - recurring:  creates a scheduled_jobs cron definition (materializer spawns job rows)
 * - batch:      body.jobs = [{payload, ...}], all share a batch_id
 */
router.post('/', async (req, res) => {
  const { queueId, type = 'immediate', payload = {}, priority = 0,
          delaySeconds, runAt, cronExpression, retryPolicyId, idempotencyKey, jobs } = req.body;

  if (!queueId) return res.status(400).json({ error: 'queueId is required' });

  const queueCheck = await pool.query('SELECT id FROM queues WHERE id = $1', [queueId]);
  if (queueCheck.rows.length === 0) return res.status(404).json({ error: 'Queue not found' });

  try {
    if (type === 'recurring') {
      if (!cronExpression) return res.status(400).json({ error: 'cronExpression required for recurring jobs' });
      cronParser.parseExpression(cronExpression); // throws if invalid
      const next = cronParser.parseExpression(cronExpression).next().toDate();
      const { rows } = await pool.query(
        `INSERT INTO scheduled_jobs (queue_id, name, cron_expression, payload_template, next_run_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [queueId, payload.name || 'recurring-job', cronExpression, payload, next]
      );
      return res.status(201).json({ data: rows[0], kind: 'scheduled_job_definition' });
    }

    if (type === 'batch') {
      if (!Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: 'jobs array required for batch type' });
      }
      const batchId = uuidv4();
      const maxAttempts = await resolveMaxAttempts(retryPolicyId);
      const inserted = [];
      for (const item of jobs) {
        const { rows } = await pool.query(
          `INSERT INTO jobs (queue_id, type, payload, priority, retry_policy_id, max_attempts, batch_id)
           VALUES ($1, 'immediate', $2, $3, $4, $5, $6) RETURNING *`,
          [queueId, item.payload || {}, priority, retryPolicyId || null, maxAttempts, batchId]
        );
        inserted.push(rows[0]);
      }
      return res.status(201).json({ data: inserted, batchId });
    }

    let effectiveRunAt = new Date();
    let status = 'queued';
    if (type === 'delayed') {
      effectiveRunAt = new Date(Date.now() + (delaySeconds || 0) * 1000);
      status = 'scheduled';
    } else if (type === 'scheduled') {
      if (!runAt) return res.status(400).json({ error: 'runAt is required for scheduled jobs' });
      effectiveRunAt = new Date(runAt);
      status = 'scheduled';
    }

    const maxAttempts = await resolveMaxAttempts(retryPolicyId);
    const { rows } = await pool.query(
      `INSERT INTO jobs (queue_id, type, status, payload, priority, retry_policy_id, max_attempts, run_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [queueId, type, status, payload, priority, retryPolicyId || null, maxAttempts, effectiveRunAt, idempotencyKey || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate idempotency key for this queue' });
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create job' });
  }
});

// List jobs with pagination + filtering
router.get('/', async (req, res) => {
  const { queueId, status, type, page = 1, pageSize = 25 } = req.query;
  if (!queueId) return res.status(400).json({ error: 'queueId query param required' });

  const limit = Math.min(parseInt(pageSize, 10) || 25, 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  const conditions = ['queue_id = $1'];
  const params = [queueId];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`type = $${params.length}`); }

  const where = conditions.join(' AND ');
  const totalRes = await pool.query(`SELECT count(*)::int AS total FROM jobs WHERE ${where}`, params);
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM jobs WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ data: rows, pagination: { page: Number(page), pageSize: limit, total: totalRes.rows[0].total } });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Job not found' });

  const executions = await pool.query(
    'SELECT * FROM job_executions WHERE job_id = $1 ORDER BY attempt_number ASC', [req.params.id]
  );
  res.json({ data: { ...rows[0], executions: executions.rows } });
});

router.get('/:id/logs', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT jl.* FROM job_logs jl
     JOIN job_executions je ON je.id = jl.job_execution_id
     WHERE je.job_id = $1 ORDER BY jl.created_at ASC`,
    [req.params.id]
  );
  res.json({ data: rows });
});

router.post('/:id/cancel', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE jobs SET status = 'cancelled' WHERE id = $1 AND status IN ('queued', 'scheduled') RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(409).json({ error: 'Job cannot be cancelled in its current state' });
  res.json({ data: rows[0] });
});

// Manually retry a job sitting in the Dead Letter Queue
router.post('/:id/retry', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dlqRes = await client.query(
      'SELECT * FROM dead_letter_entries WHERE job_id = $1 AND reprocessed = false', [req.params.id]
    );
    if (dlqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Job is not in the dead letter queue' });
    }

    await client.query(
      `UPDATE jobs SET status = 'queued', attempt_count = 0, run_at = now(), last_error = NULL
       WHERE id = $1`, [req.params.id]
    );
    await client.query(
      `UPDATE dead_letter_entries SET reprocessed = true WHERE id = $1`, [dlqRes.rows[0].id]
    );
    await client.query('COMMIT');
    res.json({ data: { message: 'Job requeued from dead letter queue' } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Retry failed' });
  } finally {
    client.release();
  }
});

export default router;

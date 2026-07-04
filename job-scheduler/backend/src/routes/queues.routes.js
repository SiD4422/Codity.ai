import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Ensure a project belongs to caller's org before touching its queues
async function assertProjectOwnership(projectId, organizationId) {
  const { rows } = await pool.query(
    'SELECT id FROM projects WHERE id = $1 AND organization_id = $2',
    [projectId, organizationId]
  );
  return rows.length > 0;
}

router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query param required' });
  if (!(await assertProjectOwnership(projectId, req.user.organizationId))) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM queues WHERE project_id = $1 ORDER BY priority DESC, created_at ASC',
    [projectId]
  );
  res.json({ data: rows });
});

router.post('/', async (req, res) => {
  const { projectId, name, priority = 0, concurrencyLimit = 5, retryPolicyId } = req.body;
  if (!projectId || !name) return res.status(400).json({ error: 'projectId and name are required' });
  if (!(await assertProjectOwnership(projectId, req.user.organizationId))) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO queues (project_id, name, priority, concurrency_limit, default_retry_policy_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectId, name, priority, concurrencyLimit, retryPolicyId || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Queue name already exists in this project' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create queue' });
  }
});

router.patch('/:id', async (req, res) => {
  const { priority, concurrencyLimit, retryPolicyId } = req.body;
  const { rows } = await pool.query(
    `UPDATE queues SET
       priority = COALESCE($1, priority),
       concurrency_limit = COALESCE($2, concurrency_limit),
       default_retry_policy_id = COALESCE($3, default_retry_policy_id)
     WHERE id = $4 RETURNING *`,
    [priority, concurrencyLimit, retryPolicyId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Queue not found' });
  res.json({ data: rows[0] });
});

router.post('/:id/pause', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE queues SET state = 'paused' WHERE id = $1 RETURNING *`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Queue not found' });
  res.json({ data: rows[0] });
});

router.post('/:id/resume', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE queues SET state = 'active' WHERE id = $1 RETURNING *`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Queue not found' });
  res.json({ data: rows[0] });
});

// Aggregate stats: counts by status, avg duration, throughput
router.get('/:id/stats', async (req, res) => {
  const queueId = req.params.id;

  const counts = await pool.query(
    `SELECT status, count(*)::int AS count FROM jobs WHERE queue_id = $1 GROUP BY status`,
    [queueId]
  );
  const throughput = await pool.query(
    `SELECT count(*)::int AS completed_last_hour
     FROM jobs WHERE queue_id = $1 AND status = 'completed' AND completed_at > now() - interval '1 hour'`,
    [queueId]
  );
  const avgDuration = await pool.query(
    `SELECT avg(duration_ms)::int AS avg_duration_ms
     FROM job_executions je JOIN jobs j ON j.id = je.job_id
     WHERE j.queue_id = $1 AND je.status = 'completed'`,
    [queueId]
  );

  const statusCounts = Object.fromEntries(counts.rows.map(r => [r.status, r.count]));
  res.json({
    data: {
      statusCounts,
      completedLastHour: throughput.rows[0].completed_last_hour,
      avgDurationMs: avgDuration.rows[0].avg_duration_ms,
    },
  });
});

export default router;
